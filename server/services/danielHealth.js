// Daniel's health checks: catch problems while they happen, not days later.
//
// Alarms (sent right away, Teams + email, at most once every 6 hours each):
//   - reply sorting stopped (this happened 22-23 Oct when the API credit ran out)
//   - the Anthropic API key or credit is failing
//   - sends stopped in the middle of the day
//   - someone was emailed after asking to stop (Lasher, 22 Oct)
//   - bounce rate spike
// Notes (morning brief only): idle reps, partner backlogs, Daniel's own errors.
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';
import { sendMail } from './graph.js';

const DANIEL_MAILBOX = (process.env.DANIEL_MAILBOX || 'dreyes@1cloudcommunications.com').toLowerCase();
const OWNER_EMAIL = 'jonathan@1cloudcommunications.com';
const q = async (sql, args = []) => (await pool.execute(sql, args))[0];

export function centralNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now).map(p => [p.type, p.value]));
  return { hour: parseInt(parts.hour, 10) % 24, weekday: parts.weekday, isWeekday: !['Sat', 'Sun'].includes(parts.weekday) };
}

// ---------- individual checks (each returns null or {key, level, text}) ----------

async function replySorting() {
  const [r] = await q(`SELECT COUNT(*) n FROM received_emails
    WHERE received_at > UTC_TIMESTAMP() - INTERVAL 3 HOUR AND received_at < UTC_TIMESTAMP() - INTERVAL 15 MINUTE
      AND prospect_id IS NOT NULL AND from_email NOT LIKE '%@comcast.com' AND classification_details IS NULL`);
  if (r.n >= 3) return { key: 'reply-sorting', level: 'alarm', text: `Reply sorting has stopped: ${r.n} prospect replies in the last 3 hours were not sorted, so meeting requests look like "neutral".  Usually the Anthropic credit or key.` };
  return null;
}

let lastApiCheck = 0;
async function apiCredit() {
  if (Date.now() - lastApiCheck < 55 * 60 * 1000) return null;   // about once an hour
  lastApiCheck = Date.now();
  try {
    await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: 'claude-haiku-5-5', max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] });
    return null;
  } catch (e) {
    const msg = String(e.message || e);
    if (/credit balance|billing|authentication|invalid x-api-key|permission/i.test(msg)) {
      return { key: 'api-credit', level: 'alarm', text: `The Anthropic API is refusing our key: "${msg.slice(0, 160)}".  Reply sorting, drafts and Daniel stop until it is fixed (console.anthropic.com, Plans & Billing).` };
    }
    return null;   // a passing network blip is not an alarm
  }
}

async function sendsStopped(now) {
  const c = centralNow(now);
  if (!c.isWeekday || c.hour < 10 || c.hour >= 15) return null;
  const [last] = await q(`SELECT MAX(sent_at) t FROM sent_emails`);
  if (!last.t || Date.now() - new Date(last.t).getTime() < 2 * 3600 * 1000) return null;
  const [today] = await q(`SELECT COUNT(*) n FROM sent_emails WHERE sent_at >= UTC_TIMESTAMP() - INTERVAL 12 HOUR`);
  const days = await q(`SELECT DATE(CONVERT_TZ(sent_at,'+00:00','-05:00')) d, COUNT(*) n FROM sent_emails
    WHERE sent_at > UTC_TIMESTAMP() - INTERVAL 8 DAY AND sent_at < UTC_TIMESTAMP() - INTERVAL 12 HOUR GROUP BY d ORDER BY d DESC LIMIT 1`);
  const prev = days[0]?.n || 0;
  if (prev < 50 || today.n >= prev * 0.8) return null;   // quiet day or already near a normal day
  const since = new Date(last.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  return { key: 'sends-stopped', level: 'alarm', text: `No emails have gone out since ${since} CT.  Today ${today.n} so far, last business day ${prev}.  Check Railway and the engine.` };
}

async function sentAfterStop() {
  const rows = await q(`
    SELECT DISTINCT p.company, p.first_name, p.last_name FROM sent_emails s
      JOIN prospects p ON p.id = s.prospect_id
      LEFT JOIN exclusion_list x ON LOWER(x.email) = LOWER(p.email)
      LEFT JOIN received_emails r ON r.prospect_id = p.id AND r.sentiment = 'negative'
    WHERE s.sent_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
      AND ((x.added_at IS NOT NULL AND s.sent_at > x.added_at) OR (r.received_at IS NOT NULL AND s.sent_at > r.received_at + INTERVAL 10 MINUTE))
    LIMIT 10`);
  if (!rows.length) return null;
  const who = rows.map(r => `${r.first_name || ''} ${r.last_name || ''} (${r.company || ''})`.trim()).join(', ');
  return { key: 'sent-after-stop', level: 'alarm', text: `Emailed after asking to stop, last 24 hours: ${who}.  They need to come out of their cadence.` };
}

async function bounces() {
  const [r] = await q(`SELECT SUM(status='bounced') b, COUNT(*) n FROM sent_emails WHERE sent_at > UTC_TIMESTAMP() - INTERVAL 1 DAY`);
  const b = Number(r.b || 0), n = Number(r.n || 0);
  if (b >= 5 && b / Math.max(n, 1) > 0.05) return { key: 'bounces', level: 'alarm', text: `${b} of ${n} emails bounced in the last 24 hours (${Math.round((b / n) * 100)}%).  A list may have bad addresses, and too many bounces hurt delivery for every rep.` };
  return null;
}

async function idleReps() {
  const rows = await q(`SELECT a.name FROM agents a WHERE a.role='outbound' AND a.status='active'
    AND NOT EXISTS (SELECT 1 FROM sent_emails s WHERE s.agent_id=a.id AND s.sent_at > UTC_TIMESTAMP() - INTERVAL 30 DAY)`);
  if (!rows.length) return null;
  return { key: 'idle-reps', level: 'note', text: `${rows.map(r => r.name).join(' and ')} show active but have sent nothing in 30 days.` };
}

async function partnerBacklog() {
  const rows = await q(`SELECT pa.name partner, COUNT(*) n, MIN(e.updated_at) oldest FROM partner_enrollments e
    JOIN agents pa ON pa.id = e.partner_agent_id WHERE e.status='waiting_partner' GROUP BY pa.name ORDER BY n DESC`);
  if (!rows.length) return null;
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  return { key: 'partner-backlog', level: 'note', text: 'Waiting on partners: ' + rows.map(r => `${r.partner.split(' ')[0]} ${r.n} (since ${fmt(r.oldest)})`).join(', ') + '.' };
}

async function danielErrors() {
  const notes = [];
  try {
    const [r] = await q(`SELECT COUNT(*) n FROM daniel_requests WHERE status='error' AND created_at > NOW() - INTERVAL 1 DAY`);
    if (r.n) notes.push(`${r.n} email(s) to Daniel failed`);
  } catch { /* table may not exist yet */ }
  try {
    const [t] = await q(`SELECT COUNT(*) n FROM daniel_triage WHERE status='error' AND created_at > NOW() - INTERVAL 1 DAY`);
    if (t.n >= 3) notes.push(`${t.n} inbox emails could not be sorted`);
  } catch { /* table may not exist yet */ }
  return notes.length ? { key: 'daniel-errors', level: 'note', text: `Daniel had trouble: ${notes.join(', ')} in the last day.` } : null;
}

async function danielCost() {
  try {
    const [r] = await q(`SELECT COALESCE(SUM(cost),0) s, COUNT(*) n FROM daniel_usage WHERE created_at > NOW() - INTERVAL 1 DAY`);
    const budget = parseFloat(process.env.DANIEL_DAILY_BUDGET || '1');
    return { key: 'daniel-cost', level: 'note', text: `Daniel cost $${Number(r.s).toFixed(2)} in the last 24 hours (${r.n} requests, daily cap $${budget.toFixed(2)}).` };
  } catch { return null; }
}

const ALARM_CHECKS = [replySorting, apiCredit, sendsStopped, sentAfterStop, bounces];
const NOTE_CHECKS = [idleReps, partnerBacklog, danielErrors, danielCost];

async function run(checks, now) {
  const out = [];
  for (const c of checks) {
    try { const r = await c(now); if (r) out.push(r); } catch (e) { console.error(`[Daniel health] ${c.name}: ${e.message}`); }
  }
  return out;
}

// Everything for the morning brief.
export async function healthForBrief(now = new Date()) {
  return [...(await run(ALARM_CHECKS, now)), ...(await run(NOTE_CHECKS, now))];
}

// ---------- alarms during the day ----------

let alarmsReady = false;
async function alarmTable() {
  if (alarmsReady) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_alarms (alarm_key VARCHAR(50) PRIMARY KEY, last_sent DATETIME NOT NULL, last_text TEXT)`);
  alarmsReady = true;
}

export async function checkAndAlert(now = new Date()) {
  const c = centralNow(now);
  if (!c.isWeekday || c.hour < 7 || c.hour >= 18) return 0;
  await alarmTable();
  const alarms = await run(ALARM_CHECKS, now);
  let sent = 0;
  for (const a of alarms) {
    const [[prev]] = await pool.execute('SELECT last_sent FROM daniel_alarms WHERE alarm_key=?', [a.key]);
    if (prev && Date.now() - new Date(prev.last_sent).getTime() < 6 * 3600 * 1000) continue;
    await pool.execute('REPLACE INTO daniel_alarms (alarm_key, last_sent, last_text) VALUES (?, NOW(), ?)', [a.key, a.text]);
    const text = `Heads up: ${a.text}`;
    try {
      const { notifyJonathan } = await import('../routes/teams.js');
      await notifyJonathan(text);
    } catch (e) { console.error('[Daniel health] Teams alert failed:', e.message); }
    try {
      await sendMail({ fromEmail: DANIEL_MAILBOX, to: OWNER_EMAIL, subject: `Heads up: ${a.text.split('.')[0].slice(0, 90)}`, html: `Jonathan,<br><br>${a.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}<br><br>Daniel` });
    } catch (e) { console.error('[Daniel health] email alert failed:', e.message); }
    console.log(`[Daniel health] ALARM ${a.key}: ${a.text}`);
    sent++;
  }
  return sent;
}
