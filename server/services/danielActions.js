// Daniel's hands in the sales platform.  Every action does exactly what the platform's own
// screens do (Inbox actions, replacement Approve/Skip links), never something new.
//
// Each action is either "auto" (Daniel just does it and reports it) or "ask" (it waits for
// Jonathan's yes: an Approve button in Teams, or replying "yes" to Daniel's email).
// Defaults follow Jonathan's rule: what the prospect asked for is just done; judgment calls ask.
// Jonathan changes a default by telling Daniel in Teams ("just do contact switches from now on").
import pool from '../db/connection.js';

export const ACTIONS = {
  stop_cadence: {
    default: 'auto',
    label: 'Stop a cadence',
    help: 'Stop all emails to one prospect.  params: {prospect_id, why: "not_now" | "unsubscribe" | "not_interested" | "other", note}.  not_now marks them Engaged (come back later), unsubscribe and not_interested mark them Unsubscribed and add them to the do-not-email list.',
  },
  mark_booked: {
    default: 'auto',
    label: 'Mark a meeting booked',
    help: 'A prospect agreed to a meeting.  params: {prospect_id, note}.  Marks them Booked, stops their cadence, logs it in the pipeline.',
  },
  mark_reply_handled: {
    default: 'auto',
    label: 'Mark a reply handled',
    help: 'Take a reply off the waiting list once it has been dealt with.  params: {received_email_id, how}.',
  },
  approve_replacement: {
    default: 'ask',
    label: 'Approve a contact switch',
    help: 'Approve a replacement contact the platform already staged.  params: {approval_id}.  Starts the new person at step 1 in the same rep and partner cadence.',
  },
  skip_replacement: {
    default: 'ask',
    label: 'Skip a contact switch',
    help: 'Skip a staged replacement contact.  params: {approval_id}.',
  },
  switch_contact: {
    default: 'ask',
    label: 'Switch to a new contact',
    help: 'When someone left and named a successor but nothing is staged.  params: {prospect_id, first_name, last_name, email, title}.  The new email must be at the same company domain.  Stops the old contact and starts the new one at step 1 with the same rep and partner.',
  },
  pause_rep: {
    default: 'ask',
    label: 'Pause a rep',
    help: 'Pause an AI rep so they send nothing.  params: {agent_id}.',
  },
  resume_rep: {
    default: 'ask',
    label: 'Resume a rep',
    help: 'Turn an AI rep back on (they start sending again).  params: {agent_id}.',
  },
};

const SHARED_MAILBOX = /^(info|accounting|accounts|ap|ar|admin|office|it|support|help|helpdesk|hr|sales|billing|contact|hello|reception)@/i;
const rootOf = email => (String(email).split('@')[1] || '').toLowerCase().split('.').slice(-2).join('.');
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

// ---------- autonomy settings ----------

export async function autonomy(db = pool) {
  const out = Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, a.default]));
  try {
    const [[row]] = await db.execute(`SELECT setting_value FROM settings WHERE setting_key='daniel_autonomy'`);
    const saved = row ? JSON.parse(row.setting_value) : {};
    for (const [k, v] of Object.entries(saved)) if (ACTIONS[k] && ['auto', 'ask'].includes(v)) out[k] = v;
  } catch { /* defaults */ }
  return out;
}

export async function setAutonomy(action, mode, db = pool) {
  if (!ACTIONS[action] || !['auto', 'ask'].includes(mode)) return `Unknown action or mode.  Actions: ${Object.keys(ACTIONS).join(', ')}; modes: auto, ask.`;
  const current = await autonomy(db);
  current[action] = mode;
  const [rows] = await db.execute(`SELECT id FROM settings WHERE setting_key='daniel_autonomy'`);
  if (rows.length) await db.execute(`UPDATE settings SET setting_value=? WHERE setting_key='daniel_autonomy'`, [JSON.stringify(current)]);
  else await db.execute(`INSERT INTO settings (setting_key, setting_value) VALUES ('daniel_autonomy', ?)`, [JSON.stringify(current)]);
  return `${ACTIONS[action].label}: ${mode === 'auto' ? 'Daniel just does it and tells you' : 'Daniel asks you first'}.`;
}

// ---------- the actions (same SQL as the platform's own screens) ----------

async function cancelEnrollments(db, prospectId) {
  await db.execute(`UPDATE prospect_sequence_enrollment SET status='cancelled' WHERE prospect_id=? AND status IN ('active','paused')`, [prospectId]);
  await db.execute(`UPDATE partner_enrollments SET status='cancelled', completed_at=NOW() WHERE prospect_id=? AND status IN ('active','waiting_partner','paused')`, [prospectId]);
}

async function prospect(db, id) {
  const [[p]] = await db.execute('SELECT id, first_name, last_name, email, company, title, status, industry, city, state FROM prospects WHERE id=?', [id]);
  if (!p) throw new Error(`No prospect ${id}`);
  return p;
}
const nameOf = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;

const RUN = {
  async stop_cadence(db, { prospect_id, why = 'other', note = '' }) {
    const p = await prospect(db, int(prospect_id));
    await cancelEnrollments(db, p.id);
    const newStatus = why === 'not_now' ? 'engaged' : ['unsubscribe', 'not_interested'].includes(why) ? 'unsubscribed' : null;
    if (newStatus) await db.execute('UPDATE prospects SET status=?, updated_at=NOW() WHERE id=?', [newStatus, p.id]);
    if (newStatus === 'unsubscribed') {
      const [x] = await db.execute('SELECT id FROM exclusion_list WHERE LOWER(email)=LOWER(?)', [p.email]);
      if (!x.length) await db.execute('INSERT INTO exclusion_list (email, company, reason) VALUES (?,?,?)', [p.email, p.company, `Daniel: ${why}. ${note}`.slice(0, 250)]);
    }
    await db.execute('INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?,?,?,NULL,?)', [p.id, p.status, newStatus || p.status, `Daniel stopped cadence (${why}). ${note}`.slice(0, 500)]);
    return `Stopped all emails to ${nameOf(p)} at ${p.company}${newStatus ? `, marked ${newStatus === 'engaged' ? 'Engaged' : 'Unsubscribed'}` : ''}.`;
  },

  async mark_booked(db, { prospect_id, note = '' }) {
    const p = await prospect(db, int(prospect_id));
    await db.execute(`UPDATE prospects SET status='booked', updated_at=NOW() WHERE id=?`, [p.id]);
    await cancelEnrollments(db, p.id);
    await db.execute(`UPDATE received_emails SET actioned=1, action_type='book_appointment', actioned_at=NOW() WHERE prospect_id=? AND (actioned=0 OR actioned IS NULL)`, [p.id]);
    await db.execute('INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?,?,?,NULL,?)', [p.id, p.status, 'booked', `Daniel: meeting booked. ${note}`.slice(0, 500)]);
    return `Marked ${nameOf(p)} at ${p.company} as Booked and stopped their cadence.`;
  },

  async mark_reply_handled(db, { received_email_id, how = 'handled' }) {
    const id = int(received_email_id);
    const [r] = await db.execute(`UPDATE received_emails SET actioned=1, action_type=?, actioned_at=NOW() WHERE id=?`, [`daniel:${String(how).slice(0, 40)}`, id]);
    if (!r.affectedRows) throw new Error(`No reply ${received_email_id}`);
    return `Reply ${id} marked handled.`;
  },

  async approve_replacement(db, { approval_id }) {
    const [[row]] = await db.execute(`SELECT ra.*, p.first_name, p.last_name, p.email, p.company FROM replacement_approvals ra JOIN prospects p ON p.id=ra.new_prospect_id WHERE ra.id=?`, [int(approval_id)]);
    if (!row) throw new Error(`No contact switch ${approval_id}`);
    if (row.status !== 'pending') return `That switch was already ${row.status}.`;
    await db.execute(`UPDATE prospects SET status='in_sequence', updated_at=NOW() WHERE id=?`, [row.new_prospect_id]);
    await db.execute(`UPDATE partner_enrollments SET status='active' WHERE id=? AND status='paused' AND current_step=1`, [row.enrollment_id]);
    await db.execute(`UPDATE replacement_approvals SET status='approved', decided_at=NOW() WHERE id=?`, [row.id]);
    return `Approved: ${nameOf(row)} at ${row.company} starts at step 1 in the next send window, after the address check.`;
  },

  async skip_replacement(db, { approval_id }) {
    const [[row]] = await db.execute(`SELECT ra.*, p.email FROM replacement_approvals ra JOIN prospects p ON p.id=ra.new_prospect_id WHERE ra.id=?`, [int(approval_id)]);
    if (!row) throw new Error(`No contact switch ${approval_id}`);
    if (row.status !== 'pending') return `That switch was already ${row.status}.`;
    await db.execute(`UPDATE partner_enrollments SET status='cancelled', completed_at=NOW() WHERE id=?`, [row.enrollment_id]);
    await db.execute(`UPDATE prospects SET status='disqualified', updated_at=NOW() WHERE id=?`, [row.new_prospect_id]);
    await db.execute(`UPDATE replacement_approvals SET status='skipped', decided_at=NOW() WHERE id=?`, [row.id]);
    return `Skipped: nothing will go to ${row.email}.`;
  },

  async switch_contact(db, { prospect_id, first_name, last_name, email, title }) {
    const old = await prospect(db, int(prospect_id));
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) throw new Error('That is not a valid email address.');
    if (SHARED_MAILBOX.test(e)) throw new Error(`${e} is a shared mailbox, not a person.`);
    if (rootOf(e) !== rootOf(old.email)) throw new Error(`${e} is not at ${old.company}'s domain (${rootOf(old.email)}).`);
    const [dupe] = await db.execute('SELECT id FROM prospects WHERE LOWER(email)=?', [e]);
    if (dupe.length) throw new Error(`${e} is already in the platform.`);
    const [[pe]] = await db.execute('SELECT id, sequence_id, agent_id, partner_agent_id FROM partner_enrollments WHERE prospect_id=? ORDER BY id DESC LIMIT 1', [old.id]);
    if (!pe) throw new Error(`${old.company} is not in a partner cadence, so there is no rep and partner to carry over.`);
    await cancelEnrollments(db, old.id);
    await db.execute(`UPDATE prospects SET status='disqualified', updated_at=NOW() WHERE id=?`, [old.id]);
    const [x] = await db.execute('SELECT id FROM exclusion_list WHERE LOWER(email)=LOWER(?)', [old.email]);
    if (!x.length) await db.execute('INSERT INTO exclusion_list (email, company, reason) VALUES (?,?,?)', [old.email, old.company, 'No longer in role (switched by Daniel)']);
    // Same as the platform's staging, then approved: email_status left empty so the address check runs first.
    const [ins] = await db.execute(
      `INSERT INTO prospects (first_name, last_name, email, company, title, industry, city, state, assigned_agent_id, source, status) VALUES (?,?,?,?,?,?,?,?,?,?, 'in_sequence')`,
      [first_name || null, last_name || null, e, old.company, title || null, old.industry, old.city, old.state, pe.agent_id, `replacement-of-${old.id}`]);
    const [enr] = await db.execute(`INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, status, current_step) VALUES (?,?,?,?, 'active', 1)`,
      [ins.insertId, pe.sequence_id, pe.agent_id, pe.partner_agent_id]);
    await db.execute(`INSERT INTO replacement_approvals (old_prospect_id, new_prospect_id, enrollment_id, status, quote, created_at, decided_at) VALUES (?,?,?, 'approved', 'Switched by Daniel', NOW(), NOW())`,
      [old.id, ins.insertId, enr.insertId]);
    return `Switched ${old.company} from ${nameOf(old)} to ${[first_name, last_name].filter(Boolean).join(' ') || e}.  Step 1 goes out in the next send window, after the address check.`;
  },

  async pause_rep(db, { agent_id }) {
    const [[a]] = await db.execute('SELECT id, name, status FROM agents WHERE id=?', [int(agent_id)]);
    if (!a) throw new Error(`No rep ${agent_id}`);
    await db.execute(`UPDATE agents SET status='paused' WHERE id=?`, [a.id]);
    return `${a.name} is paused.`;
  },

  async resume_rep(db, { agent_id }) {
    const [[a]] = await db.execute('SELECT id, name, status FROM agents WHERE id=?', [int(agent_id)]);
    if (!a) throw new Error(`No rep ${agent_id}`);
    await db.execute(`UPDATE agents SET status='active' WHERE id=?`, [a.id]);
    return `${a.name} is active again and will send in the next window.`;
  },
};

// ---------- propose / run / approve ----------

let ready = false;
async function ensureTable(db = pool) {
  if (ready) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS daniel_actions (
    id INT AUTO_INCREMENT PRIMARY KEY, action VARCHAR(40) NOT NULL, params_json TEXT NOT NULL, summary VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', origin VARCHAR(20) NULL, conversation_id VARCHAR(500) NULL,
    result TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, decided_at DATETIME NULL, INDEX(status), INDEX(conversation_id(191)))`);
  ready = true;
}

async function execute(db, id, action, params) {
  // Practice mode for testing: say what would happen, change nothing.
  if (process.env.DANIEL_ACTIONS_DRYRUN === 'true') {
    await db.execute(`UPDATE daniel_actions SET status='dryrun', result=?, decided_at=NOW() WHERE id=?`, ['Practice mode: nothing changed', id]);
    return { ok: true, result: `(practice mode, nothing changed) ${ACTIONS[action].label}` };
  }
  try {
    const result = await RUN[action](db, params || {});
    await db.execute(`UPDATE daniel_actions SET status='done', result=?, decided_at=NOW() WHERE id=?`, [result, id]);
    return { ok: true, result };
  } catch (e) {
    await db.execute(`UPDATE daniel_actions SET status='failed', result=?, decided_at=NOW() WHERE id=?`, [e.message.slice(0, 1000), id]);
    return { ok: false, result: e.message };
  }
}

// Called from Daniel's tool.  ctx collects what happened for the reply/plan.
export async function proposeOrRun({ action, params, summary }, ctx = {}, db = pool) {
  if (!ACTIONS[action]) return `Unknown action.  Available: ${Object.keys(ACTIONS).join(', ')}.`;
  await ensureTable(db);
  const mode = (await autonomy(db))[action];
  const [ins] = await db.execute(`INSERT INTO daniel_actions (action, params_json, summary, origin, conversation_id) VALUES (?,?,?,?,?)`,
    [action, JSON.stringify(params || {}), String(summary || ACTIONS[action].label).slice(0, 500), ctx.origin || null, ctx.conversationId || null]);
  const id = ins.insertId;
  if (mode === 'auto') {
    const r = await execute(db, id, action, params);
    (ctx.actions ||= []).push({ id, summary, status: r.ok ? 'done' : 'failed', result: r.result });
    return r.ok ? `Done: ${r.result}` : `Failed: ${r.result}`;
  }
  (ctx.actions ||= []).push({ id, summary, status: 'pending' });
  return `Waiting for Jonathan's OK (action #${id}).  Tell him in one line what you will do once he approves.`;
}

export async function approveAction(id, db = pool) {
  await ensureTable(db);
  const [claim] = await db.execute(`UPDATE daniel_actions SET status='running' WHERE id=? AND status='pending'`, [id]);
  if (claim.affectedRows !== 1) {
    const [[a]] = await db.execute('SELECT status, result FROM daniel_actions WHERE id=?', [id]);
    return a ? `Action #${id} was already ${a.status}.` : `No action #${id}.`;
  }
  const [[a]] = await db.execute('SELECT * FROM daniel_actions WHERE id=?', [id]);
  const r = await execute(db, id, a.action, JSON.parse(a.params_json));
  return r.ok ? r.result : `It did not work: ${r.result}`;
}

export async function cancelAction(id, db = pool) {
  await ensureTable(db);
  const [r] = await db.execute(`UPDATE daniel_actions SET status='cancelled', decided_at=NOW() WHERE id=? AND status='pending'`, [id]);
  return r.affectedRows ? 'Cancelled.  Nothing changed.' : 'That one was already decided.';
}

export async function pendingActions({ conversationId = null, days = 7 } = {}, db = pool) {
  await ensureTable(db);
  const [rows] = conversationId
    ? await db.execute(`SELECT id, action, summary, created_at FROM daniel_actions WHERE status='pending' AND conversation_id=? ORDER BY id`, [conversationId])
    : await db.execute(`SELECT id, action, summary, created_at FROM daniel_actions WHERE status='pending' AND created_at > NOW() - INTERVAL ${parseInt(days, 10)} DAY ORDER BY id`);
  return rows;
}

export async function linkActions(ids, conversationId, db = pool) {
  if (!ids.length) return;
  await ensureTable(db);
  await db.execute(`UPDATE daniel_actions SET conversation_id=? WHERE id IN (${ids.map(() => '?').join(',')})`, [conversationId, ...ids]);
}

// ---------- tool definitions ----------

export const ACTION_TOOL = {
  name: 'platform_action',
  description: 'Do something in the sales platform.  Some actions run right away, others wait for Jonathan\'s OK; the result tells you which.  Look up the ids first (lookup_company / lookup_person show prospect ids; list_replies_waiting and list_contact_switches show the others).\n'
    + Object.entries(ACTIONS).map(([k, a]) => `- ${k}: ${a.help}`).join('\n'),
  input_schema: {
    type: 'object',
    properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, params: { type: 'object' }, summary: { type: 'string', description: 'one plain sentence for Jonathan, e.g. "Switch Provident Title to Scott Hernandez, CFO"' } },
    required: ['action', 'params', 'summary'], additionalProperties: false,
  },
};

export const LIST_TOOLS = [
  { name: 'list_replies_waiting', description: 'Prospect replies from the last 7 days that nobody has handled yet, with reply ids and prospect ids.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_contact_switches', description: 'Contact switches (replacement contacts) waiting for approval, with approval ids.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_reps', description: 'The AI reps with their ids and status.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
];

export async function runListTool(name, db = pool) {
  if (name === 'list_replies_waiting') {
    const [rows] = await db.execute(`SELECT r.id reply_id, r.prospect_id, r.sentiment, r.received_at, p.first_name, p.last_name, p.company, p.status, LEFT(r.body_text, 160) said
      FROM received_emails r JOIN prospects p ON p.id=r.prospect_id
      WHERE r.received_at > UTC_TIMESTAMP() - INTERVAL 7 DAY AND (r.actioned=0 OR r.actioned IS NULL) AND r.from_email NOT LIKE '%@comcast.com'
        AND r.sentiment NOT IN ('ooo','neutral') ORDER BY r.received_at DESC LIMIT 25`);
    return rows.map(r => `reply ${r.reply_id} / prospect ${r.prospect_id}: ${r.first_name || ''} ${r.last_name || ''}, ${r.company} (${r.sentiment}, prospect status ${r.status}): ${String(r.said || '').replace(/\s+/g, ' ')}`).join('\n') || 'No replies waiting.';
  }
  if (name === 'list_contact_switches') {
    const [rows] = await db.execute(`SELECT ra.id, po.company, CONCAT(po.first_name,' ',po.last_name) old_name, CONCAT(pn.first_name,' ',pn.last_name) new_name, pn.title, pn.email, ra.created_at
      FROM replacement_approvals ra JOIN prospects po ON po.id=ra.old_prospect_id JOIN prospects pn ON pn.id=ra.new_prospect_id WHERE ra.status='pending' ORDER BY ra.id`);
    return rows.map(r => `approval ${r.id}: ${r.company}, ${r.old_name} -> ${r.new_name} (${r.title || ''}, ${r.email}), staged ${String(r.created_at).slice(4, 15)}`).join('\n') || 'No contact switches waiting.';
  }
  if (name === 'list_reps') {
    const [rows] = await db.execute(`SELECT id, name, title, role, status FROM agents ORDER BY id`);
    return rows.map(r => `rep ${r.id}: ${r.name}, ${r.title} (${r.role}, ${r.status})`).join('\n');
  }
  return 'Unknown list.';
}

export const AUTONOMY_TOOL = {
  name: 'set_autonomy',
  description: 'Change whether Daniel asks first or just does an action.  Only when Jonathan explicitly says so in this chat.',
  input_schema: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, mode: { type: 'string', enum: ['auto', 'ask'] } }, required: ['action', 'mode'], additionalProperties: false },
};
