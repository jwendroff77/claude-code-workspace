import pool from '../db/connection.js';
import { sendMail, replyAllWithBcc, getThreadMessages, getRecentSent } from './graph.js';

// Kayla step 4 on the engine (moved off Jonathan's laptop 5 Nov 2026, after a laptop sleep
// stopped a batch for 2 hours).  Kayla replies-all on Steven's step 3 note ("Just checking back
// on Kayla's introduction") in each Kayla + Steven thread.  Seq 8/10 step 3 stays held at
// delay 999, so the partner cadence can never also send its own step 4.
//
// Nothing sends until Jonathan releases a run: one engine_runs row per day (job 'kayla_step4').
//   status 'canary'      -> sends 1 with BCC Jonathan, verifies it in Sent Items, then 'canary_sent'
//   status 'canary_sent' -> waits for Jonathan's go
//   status 'active'      -> sends up to send_limit at gap_sec gaps, 7:40am-4:55pm CT
//   status 'done'        -> limit reached;  'stopped' -> stopped by hand
// Same log subject as the laptop script ('Kayla step 4'), so nobody already sent gets a second.

export const PARTNER_DAILY_CAP = 125; // Jonathan raised from 100 on 2026-10-07
export const KAYLA_DAILY_CAP = 200;   // Kayla Pierce (agent 9) only - Jonathan 2026-11-04 (was 175)

const JOB = 'kayla_step4';
const KAYLA_ID = 9;
const KAYLA = 'kpierce@1cloudnow.com';
const STEVEN = 'steven_filek@comcast.com';
const JONATHAN = 'jonathan@1cloudcommunications.com';
const ALERT_FROM = 'mbarrett@1cloudnow.com';
const SUBJ_LOG = 'Kayla step 4';
const DEAD = ['disqualified', 'unsubscribed', 'bounced', 'booked', 'handed_off', 'won', 'engaged'];
const GRAPH_CHECKS_PER_TICK = 40;

const BODY = `Hi {{firstName}},<br><br>Wanted to circle back on my introduction to Steven.&nbsp; I thought it would be worthwhile for you two to connect, even if there isn't an immediate project on the table.<br><br>Comcast Business and 1Cloud can be a resource when something does come up, and having the relationship established ahead of time can make things easier.<br><br>Would a quick introduction make sense?<br><br>Thanks,<br><br>Kayla Pierce<br>Senior Enterprise Account Executive - 1Cloud Communications<br>8530 Eagle Point Blvd, Suite 100, Lake Elmo, MN<br>www.1cloudcommunications.com`;

export const ENGINE_RUNS_TABLE = `CREATE TABLE IF NOT EXISTS engine_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job VARCHAR(40) NOT NULL,
  run_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'canary',
  send_limit INT NOT NULL,
  gap_sec INT NOT NULL DEFAULT 90,
  sent INT NOT NULL DEFAULT 0,
  last_send_at DATETIME NULL,
  heartbeat_at DATETIME NULL,
  waiting_reason VARCHAR(160) NULL,
  last_error VARCHAR(255) NULL,
  error_count INT NOT NULL DEFAULT 0,
  alerted_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY job_date (job, run_date)
)`;

const ctNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
const ctDate = () => { const d = ctNow(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const minsSinceCtMidnight = () => { const d = ctNow(); return d.getHours() * 60 + d.getMinutes(); };
const isWeekday = () => { const g = ctNow().getDay(); return g >= 1 && g <= 5; };
// Same window as the partner cadence: 7:40am-4:55pm CT
const inWindow = () => { const m = minsSinceCtMidnight(); return m >= 7 * 60 + 40 && m < 16 * 60 + 55; };

const addr = m => (m.from?.emailAddress?.address || '').toLowerCase();
const isOOO = m => /automatic reply|auto(matic)?[- ]?reply|out of (the )?office|\booo\b|away from|on leave|undeliverable|delivery has failed/i.test(`${m.subject} ${m.bodyPreview}`);

// Threads that weren't ready, so each tick doesn't re-read them from Graph.
// 'prospect replied' holds for the day; the rest are re-checked after 30 minutes
// (Steven may send his step 3 later in the day).
const skipCache = new Map();

async function setRun(id, fields) {
  const keys = Object.keys(fields);
  await pool.execute(
    `UPDATE engine_runs SET ${keys.map(k => `${k} = ?`).join(', ')}, heartbeat_at = NOW() WHERE id = ?`,
    [...keys.map(k => fields[k]), id]
  );
}

// Why a thread is not ready for step 4, or null when it is.  Mirrors send-kayla-step4-v2.mjs.
async function checkThread(e) {
  if (!e.conversation_id) return { why: 'no thread', hold: 'day' };
  const msgs = await getThreadMessages({ email: KAYLA, conversationId: e.conversation_id });
  const st = msgs.filter(m => addr(m) === STEVEN);
  const hasStep3 = st.some(m => /checking back/i.test(m.bodyPreview || ''))
    || (st.length >= 2 && st[0].receivedDateTime < '2026-10-12' && st[st.length - 1].receivedDateTime >= '2026-10-12');
  if (!hasStep3) return { why: 'no Steven step 3', hold: '30m' };
  const last = st[st.length - 1];
  const ext = msgs.filter(m => addr(m) !== STEVEN && !addr(m).endsWith('@1cloudnow.com') && !addr(m).endsWith('@1cloudcommunications.com'));
  if (ext.some(m => !isOOO(m))) return { why: 'prospect replied', hold: 'day' };
  if (msgs.some(m => addr(m) === KAYLA && m.receivedDateTime > last.receivedDateTime)) return { why: 'Kayla already after Steven', hold: 'day' };
  const to = (last.toRecipients || []).map(x => x.emailAddress.address.toLowerCase());
  if (!to.includes((e.email || '').toLowerCase())) return { why: 'prospect not on Steven note', hold: 'day' };
  return { ready: true, lastId: last.id };
}

// Dry run: how many threads are ready right now and why the rest aren't.  Sends nothing.
export async function previewKaylaStep4({ max = 9999 } = {}) {
  const [rows] = await pool.query(
    `SELECT pe.id enr, pe.conversation_id, p.id pid, p.first_name, p.last_name, p.company, p.email
     FROM partner_enrollments pe JOIN prospects p ON p.id = pe.prospect_id
     WHERE pe.sequence_id IN (8, 10) AND pe.agent_id = ? AND pe.status = 'active' AND pe.current_step = 3
       AND p.status NOT IN (${DEAD.map(() => '?').join(', ')})
       AND NOT EXISTS (SELECT 1 FROM exclusion_list x WHERE x.email = p.email)
       AND NOT EXISTS (SELECT 1 FROM sent_emails se WHERE se.prospect_id = p.id AND se.subject = ?)
     ORDER BY pe.partner_replied_at, pe.id`,
    [KAYLA_ID, ...DEAD, SUBJ_LOG]
  );
  const tally = { candidates: rows.length, ready: 0 };
  const ready = [];
  for (const e of rows.slice(0, max)) {
    const r = await checkThread(e);
    if (r.ready) { tally.ready++; ready.push(`#${e.enr} ${e.first_name} ${e.last_name} (${e.company})`); }
    else tally[r.why] = (tally[r.why] || 0) + 1;
  }
  return { tally, ready };
}

export async function runKaylaStep4Tick() {
  if (!isWeekday() || !inWindow()) return;

  const [runs] = await pool.query(
    `SELECT * FROM engine_runs WHERE job = ? AND run_date = ? AND status IN ('canary', 'active') ORDER BY id DESC LIMIT 1`,
    [JOB, ctDate()]
  );
  if (!runs.length) return;
  const run = runs[0];

  const lockConn = await pool.getConnection();
  const [lk] = await lockConn.query(`SELECT GET_LOCK('kayla_step4', 0) AS got`);
  if (lk[0].got !== 1) { lockConn.release(); return; }

  try {
    if (run.sent >= run.send_limit) { await setRun(run.id, { status: 'done', waiting_reason: 'idle: limit reached' }); return; }

    const mins = minsSinceCtMidnight();
    const [[cap]] = await pool.query(
      `SELECT COUNT(*) n FROM sent_emails WHERE agent_id = ? AND sent_at >= NOW() - INTERVAL ${mins} MINUTE`, [KAYLA_ID]);
    if (cap.n >= KAYLA_DAILY_CAP) { await setRun(run.id, { waiting_reason: `idle: Kayla daily cap (${KAYLA_DAILY_CAP}) reached` }); return; }

    // Gap since Kayla's last email of any kind (step 1s from the cadence count too)
    const [[gap]] = await pool.query(
      `SELECT COUNT(*) n FROM sent_emails WHERE agent_id = ? AND sent_at > NOW() - INTERVAL ? SECOND`, [KAYLA_ID, run.gap_sec]);
    if (gap.n) { await setRun(run.id, { waiting_reason: 'gap' }); return; }

    const [rows] = await pool.query(
      `SELECT pe.id enr, pe.conversation_id, p.id pid, p.first_name, p.last_name, p.company, p.email
       FROM partner_enrollments pe JOIN prospects p ON p.id = pe.prospect_id
       WHERE pe.sequence_id IN (8, 10) AND pe.agent_id = ? AND pe.status = 'active' AND pe.current_step = 3
         AND p.status NOT IN (${DEAD.map(() => '?').join(', ')})
         AND NOT EXISTS (SELECT 1 FROM exclusion_list x WHERE x.email = p.email)
         AND NOT EXISTS (SELECT 1 FROM sent_emails se WHERE se.prospect_id = p.id AND se.subject = ?)
       ORDER BY pe.partner_replied_at, pe.id`,
      [KAYLA_ID, ...DEAD, SUBJ_LOG]
    );

    const now = Date.now();
    let checks = 0, waitingSteven = 0, unchecked = 0, pick = null;
    for (const e of rows) {
      const c = skipCache.get(e.enr);
      if (c && c.until > now) { if (c.why === 'no Steven step 3') waitingSteven++; continue; }
      if (checks >= GRAPH_CHECKS_PER_TICK) { unchecked++; continue; }
      checks++;
      const r = await checkThread(e);
      if (r.ready) { pick = { ...e, lastId: r.lastId }; break; }
      skipCache.set(e.enr, { why: r.why, until: now + (r.hold === '30m' ? 30 * 60e3 : 12 * 3600e3) });
      if (r.why === 'no Steven step 3') waitingSteven++;
    }

    if (!pick) {
      await setRun(run.id, { waiting_reason: unchecked ? 'checking threads' : `idle: none ready (${waitingSteven} waiting on Steven step 3)` });
      return;
    }

    const html = BODY.replace(/\{\{firstName\}\}/g, pick.first_name || '');
    const canary = run.status === 'canary';
    await replyAllWithBcc({ fromEmail: KAYLA, messageId: pick.lastId, html, bcc: canary ? JONATHAN : null });
    await pool.execute(
      `INSERT INTO sent_emails (prospect_id, agent_id, to_email, subject, body, status, sent_at) VALUES (?, ?, ?, ?, ?, 'sent', NOW())`,
      [pick.pid, KAYLA_ID, pick.email, SUBJ_LOG, html]
    );
    skipCache.delete(pick.enr);
    console.log(`[KaylaStep4] SENT ${run.sent + 1}/${run.send_limit} #${pick.enr} ${pick.first_name} ${pick.last_name} (${pick.company})${canary ? ' CANARY' : ''}`);

    if (!canary) {
      await pool.execute(
        `UPDATE engine_runs SET sent = sent + 1, last_send_at = NOW(), heartbeat_at = NOW(), error_count = 0, last_error = NULL, waiting_reason = 'sending' WHERE id = ?`,
        [run.id]);
      return;
    }

    // Canary: confirm it in Sent Items, hold the rest, tell Jonathan
    await new Promise(r => setTimeout(r, 8000));
    const m = (await getRecentSent({ email: KAYLA }))[0] || {};
    const list = xs => (xs || []).map(x => x.emailAddress.address).join(', ');
    const verified = (m.bccRecipients || []).some(x => x.emailAddress.address.toLowerCase() === JONATHAN);
    await pool.execute(
      `UPDATE engine_runs SET status = 'canary_sent', sent = sent + 1, last_send_at = NOW(), heartbeat_at = NOW(), error_count = 0, last_error = NULL,
       waiting_reason = ? WHERE id = ?`,
      [`idle: canary ${verified ? 'verified' : 'NOT verified'}, waiting for go`.slice(0, 160), run.id]);
    await sendMail({
      fromEmail: ALERT_FROM, to: JONATHAN,
      subject: `Kayla step 4 canary sent: ${pick.company}`,
      html: `<p>Canary sent to ${pick.first_name} ${pick.last_name} (${pick.company}).</p>
<p>${m.subject || ''}<br>To: ${list(m.toRecipients)}<br>BCC: ${list(m.bccRecipients)}</p>
<p>${verified ? 'Verified in Kayla\'s Sent Items.' : 'Could NOT verify it in Sent Items. Check before going ahead.'}  The other ${run.send_limit - 1} wait for your go.</p>`,
    });
  } catch (err) {
    console.error(`[KaylaStep4] ${err.message}`);
    try {
      await pool.execute(
        `UPDATE engine_runs SET error_count = error_count + 1, last_error = ?, heartbeat_at = NOW() WHERE id = ?`,
        [String(err.message).slice(0, 255), run.id]);
    } catch {}
  } finally {
    try { await lockConn.query(`SELECT RELEASE_LOCK('kayla_step4')`); } catch {}
    lockConn.release();
  }
}

// =====================================================
// STALL WATCHDOG — runs on Railway, so it works when the laptop is off.
// Emails Jonathan when sends that should be going have gone quiet.  Each alert
// repeats at most once an hour.
// =====================================================
const lastStepOneAlert = new Map();

async function alert(subject, lines) {
  await sendMail({ fromEmail: ALERT_FROM, to: JONATHAN, subject, html: `<p>${lines.join('<br>')}</p>` });
  console.log(`[Watchdog] ALERT: ${subject}`);
}

export async function runEngineWatchdog() {
  if (!isWeekday() || !inWindow()) return;
  const mins = minsSinceCtMidnight();
  if (mins < 7 * 60 + 55) return; // let the window open before judging

  // 1. Kayla step 4 run.  "No send" means Kayla has sent nothing of any kind: step 4s wait their turn
  // while step 1s are going out (shared gap), and that is healthy, not a stall (false alarm 9 Nov 2026).
  const [runs] = await pool.query(
    `SELECT *, TIMESTAMPDIFF(MINUTE, heartbeat_at, NOW()) hb_age,
            TIMESTAMPDIFF(MINUTE, GREATEST(COALESCE(last_send_at, created_at), created_at,
              COALESCE((SELECT MAX(sent_at) FROM sent_emails WHERE agent_id = ${KAYLA_ID}), created_at)), NOW()) send_age,
            TIMESTAMPDIFF(MINUTE, alerted_at, NOW()) alert_age
     FROM engine_runs WHERE job = ? AND run_date = ? AND status IN ('canary', 'active')`,
    [JOB, ctDate()]
  );
  for (const r of runs) {
    if (r.alert_age !== null && r.alert_age < 60) continue;
    const idle = (r.waiting_reason || '').startsWith('idle:');
    let why = null;
    if (r.hb_age === null || r.hb_age >= 10) why = `the engine hasn't checked in for ${r.hb_age ?? '?'} minutes`;
    else if (r.error_count >= 3) why = `${r.error_count} errors in a row: ${r.last_error}`;
    else if (!idle && r.send_age >= 15) why = `no send in ${r.send_age} minutes (status: ${r.waiting_reason || 'none'})`;
    if (!why) continue;
    await alert(`Platform alert: Kayla step 4 sends stalled`, [
      `Kayla step 4 run: ${r.sent} of ${r.send_limit} sent.`,
      `Problem: ${why}.`,
      `Last send: ${r.last_send_at ? new Date(r.last_send_at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' }) + ' CT' : 'none yet'}.`,
    ]);
    await pool.execute(`UPDATE engine_runs SET alerted_at = NOW() WHERE id = ?`, [r.id]);
  }

  // 2. Partner cadence step 1s: released intros are due but the agent has gone quiet
  const [due] = await pool.query(
    `SELECT pe.agent_id, a.name, COUNT(*) due,
            (SELECT COUNT(*) FROM sent_emails s WHERE s.agent_id = pe.agent_id AND s.sent_at >= NOW() - INTERVAL ${mins} MINUTE) today,
            (SELECT TIMESTAMPDIFF(MINUTE, MAX(s.sent_at), NOW()) FROM sent_emails s WHERE s.agent_id = pe.agent_id) quiet
     FROM partner_enrollments pe
     JOIN partner_sequences ps ON ps.id = pe.sequence_id AND ps.status = 'active'
     JOIN partner_sequence_steps st ON st.sequence_id = pe.sequence_id AND st.step_number = pe.current_step AND st.step_type = 'agent_send_cc'
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     WHERE pe.status = 'active' AND pe.current_step = 1
       AND DATE_ADD(pe.enrolled_at, INTERVAL st.delay_days DAY) <= NOW()
       AND p.status NOT IN (${DEAD.map(() => '?').join(', ')})
     GROUP BY pe.agent_id, a.name`,
    DEAD
  );
  for (const d of due) {
    const cap = d.agent_id === KAYLA_ID ? KAYLA_DAILY_CAP : PARTNER_DAILY_CAP;
    if (d.today >= cap || d.quiet === null || d.quiet < 15) continue;
    const last = lastStepOneAlert.get(d.agent_id) || 0;
    if (Date.now() - last < 60 * 60e3) continue;
    lastStepOneAlert.set(d.agent_id, Date.now());
    await alert(`Platform alert: ${d.name} step 1 sends stalled`, [
      `${d.due} released step 1 intro(s) are due for ${d.name}, but nothing has sent in ${d.quiet} minutes.`,
      `${d.name} has sent ${d.today} of ${cap} today.`,
    ]);
  }
}
