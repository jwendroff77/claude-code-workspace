// Daniel in Microsoft Teams: a chat with memory of the conversation, the same tools as email,
// and drafts Jonathan sends with a Send button.
import crypto from 'crypto';
import pool from '../db/connection.js';
import { runAgent, systemPrompt, sendDraft, SEND_ON, todayCT, TEAM, parsePlan, noDashes } from './daniel.js';
import { preferences, remember, MAILBOXES } from './danielTools.js';
import { replyToMessage } from './graph.js';
import { AUTONOMY_TOOL, setAutonomy, approveAction, cancelAction, pendingActions, autonomy } from './danielActions.js';

const HISTORY_TURNS = 12;

let ready = false;
async function ensureTables() {
  if (ready) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_chat (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL,
    text MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(conversation_id)
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_chat_drafts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    draft_json MEDIUMTEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  ready = true;
}

const CHAT_RULES = `

TEAMS CHAT
You are now chatting with Jonathan in Microsoft Teams.  Ignore the plan JSON format above; in chat use the format below.
- Answer like a sharp coworker: short, plain text, a few sentences or a short list.  No headings.  No em dashes.
- Look things up with your tools before answering, same as for email.
- If he asks you to email someone, write the draft.  He sees it with Send and Cancel buttons, and it goes out only when he taps Send.  To answer inside an existing thread (for example Kayla's thread with Steven), find the message with search_mailbox and put its mailbox and id in reply_to; it is then sent as a reply-all from that mailbox.
- Never say you sent or emailed something from chat.  A draft waits for his Send tap, so say "here's the draft" instead.
- If he asks to be reminded, add a reminder with a due date.  It shows on his 8:00am list that day.
- Use list_open_items when he asks what is open, and mark_done when he says something is finished.
- Sales-platform actions that wait for his OK show him Approve and Cancel buttons.  If he answers in words instead ("yes do it", "skip that one"), use decide_action.
- Only when he explicitly tells you to change how you work ("just do contact switches from now on", "ask me before stopping cadences"), use set_autonomy, then confirm the new setting in one line.

Your final message is JSON only:
{"reply": "what you say back",
 "draft": null or {"from": "daniel|jenna|hannah", "to": ["email"], "cc": ["email"], "subject": "...", "body": "plain text", "reply_to": null or {"mailbox": "kayla", "id": "message id"}},
 "reminders": [{"what": "...", "due": "YYYY-MM-DD"}]}`;

export function parseChat(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (typeof o.reply !== 'string' || !o.reply.trim()) return null;
  // Reuse the email rules for drafts (valid senders, real addresses, never to the team).
  const checked = o.draft ? parsePlan(JSON.stringify({ summary: 'x', owner: 'daniel', steps: [], draft: o.draft })) : null;
  let draft = checked?.draft || null;
  const rt = o.draft?.reply_to;
  if (draft && rt && MAILBOXES[rt.mailbox] && typeof rt.id === 'string' && rt.id.length > 10) draft = { ...draft, reply_to: { mailbox: rt.mailbox, id: rt.id } };
  const reminders = (Array.isArray(o.reminders) ? o.reminders : [])
    .filter(r => r && r.what && /^\d{4}-\d{2}-\d{2}$/.test(r.due || ''))
    .map(r => ({ what: noDashes(r.what), due: r.due }));
  return { reply: noDashes(o.reply), draft, reminders };
}

// Chat-only tools: what is open on Jonathan's list, closing items, deciding waiting actions,
// and the ask-first / just-do-it switches (only from Jonathan's own words in this chat).
const EXTRA_TOOLS = [
  AUTONOMY_TOOL,
  { name: 'decide_action', description: 'Approve or cancel a sales-platform action that is waiting for Jonathan (when he says yes or no to it in chat).', input_schema: { type: 'object', properties: { id: { type: 'integer' }, decision: { type: 'string', enum: ['approve', 'cancel'] } }, required: ['id', 'decision'], additionalProperties: false } },
  { name: 'list_waiting_actions', description: 'Sales-platform actions waiting for Jonathan\'s OK, with ids.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_open_items', description: "List open items from Daniel's requests (with ids), including steps and due dates.", input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'mark_done', description: 'Mark one open item done by its id from list_open_items.', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false } },
];

async function extraRun(name, input) {
  if (name === 'set_autonomy') return { content: await setAutonomy(input.action, input.mode) };
  if (name === 'decide_action') return { content: input.decision === 'approve' ? await approveAction(input.id) : await cancelAction(input.id) };
  if (name === 'list_waiting_actions') {
    const rows = await pendingActions();
    const modes = await autonomy();
    return { content: (rows.map(a => `action ${a.id}: ${a.summary}`).join('\n') || 'Nothing waiting.') + '\n\nCurrent settings: ' + Object.entries(modes).map(([k, v]) => `${k}=${v}`).join(', ') };
  }
  if (name === 'list_open_items') {
    const [rows] = await pool.execute(`SELECT id, conversation_id, subject, plan_json FROM daniel_requests
      WHERE status IN ('planned','awaiting_approval','approved_send_off','sent') AND plan_json IS NOT NULL ORDER BY id DESC LIMIT 40`);
    const [doneRows] = await pool.execute(`SELECT DISTINCT conversation_id FROM daniel_requests WHERE status='done'`);
    const done = new Set(doneRows.map(r => r.conversation_id));
    const seen = new Set();
    const lines = [];
    for (const r of rows) {
      if (done.has(r.conversation_id) || seen.has(r.conversation_id)) continue;
      seen.add(r.conversation_id);
      let p; try { p = JSON.parse(r.plan_json); } catch { continue; }
      const steps = (p.steps || []).map(s => `${s.who}: ${s.what}${s.due ? ' (due ' + s.due + ')' : ''}`).join('; ');
      lines.push(`id ${r.id}: ${r.subject || ''}.  ${steps}`);
    }
    return { content: lines.join('\n') || 'Nothing open.' };
  }
  if (name === 'mark_done') {
    const [[r]] = await pool.execute('SELECT conversation_id, subject FROM daniel_requests WHERE id=?', [input.id]);
    if (!r) return { content: 'No item with that id.', is_error: true };
    await pool.execute(`UPDATE daniel_requests SET status='done' WHERE conversation_id=?`, [r.conversation_id]);
    await remember({ kind: 'done', topic: String(r.subject || '').slice(0, 200), note: `Jonathan marked this done in Teams on ${todayCT()}.` }).catch(() => {});
    return { content: `Marked done: ${r.subject}` };
  }
  return { content: 'Unknown tool', is_error: true };
}

async function history(conversationId) {
  const [rows] = await pool.execute(`SELECT role, text FROM daniel_chat WHERE conversation_id=? ORDER BY id DESC LIMIT ${HISTORY_TURNS * 2}`, [conversationId]);
  const msgs = rows.reverse().map(r => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.text }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

export async function chatTurn({ conversationId, text }) {
  await ensureTables();
  const prefs = await preferences().catch(() => '');
  const messages = await history(conversationId);
  messages.push({ role: 'user', content: `Today is ${todayCT()}.\n${prefs ? `Jonathan's standing preferences:\n${prefs}\n` : ''}\nJonathan: ${text}` });
  const out = await runAgent({ systemText: systemPrompt() + CHAT_RULES, messages, parse: parseChat, source: 'teams', what: 'reply', extraTools: EXTRA_TOOLS, extraRun, ctx: { origin: 'teams', conversationId } });

  await pool.execute('INSERT INTO daniel_chat (conversation_id, role, text) VALUES (?,?,?), (?,?,?)',
    [conversationId, 'user', text, conversationId, 'assistant', out.reply + (out.draft ? `\n[draft to ${out.draft.to.join(', ')}: ${out.draft.subject}]` : '')]);

  for (const r of out.reminders) {
    const id = 'teams:' + crypto.randomUUID();
    await pool.execute(`INSERT INTO daniel_requests (message_id, conversation_id, subject, note, plan_json, status) VALUES (?,?,?,?,?, 'planned')`,
      [id, id, ('Teams: ' + r.what).slice(0, 500), text.slice(0, 2000), JSON.stringify({ summary: r.what, owner: 'jonathan', steps: [{ who: 'jonathan', what: r.what, due: r.due }], draft: null, questions: [], flags: [] })]);
  }

  let draftId = null;
  if (out.draft) {
    const [ins] = await pool.execute('INSERT INTO daniel_chat_drafts (conversation_id, draft_json) VALUES (?,?)', [conversationId, JSON.stringify(out.draft)]);
    draftId = ins.insertId;
  }
  return { reply: out.reply, draft: out.draft, draftId, waiting: (out.actions || []).filter(a => a.status === 'pending') };
}

// Send or cancel a draft from its Teams button.  Returns the text to show.
export async function resolveDraft({ conversationId, draftId, action }) {
  await ensureTables();
  const [[row]] = await pool.execute('SELECT * FROM daniel_chat_drafts WHERE id=? AND conversation_id=?', [draftId, conversationId]);
  if (!row) return 'I cannot find that draft.';
  if (row.status !== 'pending') return `That draft was already ${row.status}.`;
  const d = JSON.parse(row.draft_json);
  if (action === 'cancel') {
    await pool.execute(`UPDATE daniel_chat_drafts SET status='cancelled' WHERE id=?`, [draftId]);
    return 'Cancelled.  Nothing was sent.';
  }
  if (!SEND_ON()) return 'Sending is still switched off (DANIEL_SEND_ENABLED in Railway), so nothing went out.  You can copy the draft above.';
  // Claim before sending so a double tap cannot send twice.
  const [claim] = await pool.execute(`UPDATE daniel_chat_drafts SET status='sending' WHERE id=? AND status='pending'`, [draftId]);
  if (claim.affectedRows !== 1) return 'That draft is already being sent.';
  try {
    if (d.reply_to) {
      const body = d.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      await replyToMessage({ fromEmail: MAILBOXES[d.reply_to.mailbox], messageId: d.reply_to.id, html: body });
    } else {
      await sendDraft(d);
    }
  } catch (e) {
    await pool.execute(`UPDATE daniel_chat_drafts SET status='pending' WHERE id=?`, [draftId]);
    return `It did not send: ${e.message}`;
  }
  await pool.execute(`UPDATE daniel_chat_drafts SET status='sent' WHERE id=?`, [draftId]);
  const who = d.reply_to ? `${TEAM[d.reply_to.mailbox]?.name || d.reply_to.mailbox}'s thread (reply-all)` : TEAM[d.from].name;
  await remember({ kind: 'done', topic: d.subject.slice(0, 200), note: `Sent "${d.subject}" to ${d.to.join(', ')} from ${who} on ${todayCT()}, approved in Teams.` }).catch(() => {});
  return d.reply_to ? `Sent as a reply-all in ${who}.` : `Sent from ${who}.  You are copied.`;
}
