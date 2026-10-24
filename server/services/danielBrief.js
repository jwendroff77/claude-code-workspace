// Daniel's morning brief, weekdays 8:00am CT.  Replaces the plain 8:00am list.
// Sections: Needs you, Meetings, Done for you, Health check, Team, Your inbox, Looking ahead.
// Everything is read from real data; only "Looking ahead" (and the one-line opener) is written by the model.
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';
import { sendMail } from './graph.js';
import { dueItems, todayISO, renderTriage, ON, TEAM } from './daniel.js';
import { calendarEvents, isOutsideMeeting } from './danielTools.js';
import { healthForBrief } from './danielHealth.js';
import { addBusinessDays } from './danielMeetings.js';

const DANIEL_MAILBOX = (process.env.DANIEL_MAILBOX || 'dreyes@1cloudcommunications.com').toLowerCase();
const OWNER_EMAIL = 'jonathan@1cloudcommunications.com';
const q = async (sql, args = []) => (await pool.execute(sql, args))[0];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+--+\s+/g, ', ');
const first = name => String(name || '').split(' ')[0];
const dayLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// ---------- data ----------

async function repliesWaiting() {
  return q(`SELECT r.sentiment, r.received_at, p.first_name, p.last_name, p.company, a.name agent, LEFT(r.body_text, 200) said
    FROM received_emails r JOIN prospects p ON p.id = r.prospect_id LEFT JOIN agents a ON a.id = r.agent_id
    WHERE r.received_at > UTC_TIMESTAMP() - INTERVAL 5 DAY AND r.sentiment IN ('meeting_request','positive','question')
      AND (r.actioned = 0 OR r.actioned IS NULL) AND r.from_email NOT LIKE '%@comcast.com'
      AND p.status NOT IN ('booked','unsubscribed','disqualified','won','bounced')
    ORDER BY FIELD(r.sentiment,'meeting_request','positive','question'), r.received_at DESC LIMIT 8`);
}

async function approvalsWaiting() {
  try {
    return await q(`SELECT a.created_at, po.company, CONCAT(pn.first_name,' ',pn.last_name) new_name, pn.title new_title
      FROM replacement_approvals a LEFT JOIN prospects po ON po.id = a.old_prospect_id LEFT JOIN prospects pn ON pn.id = a.new_prospect_id
      WHERE a.status = 'pending' ORDER BY a.created_at`);
  } catch { return []; }
}

async function teamLines() {
  const agents = await q(`SELECT id, name, status FROM agents WHERE role = 'outbound' ORDER BY id`);
  const lines = [];
  for (const a of agents) {
    const [s] = await q(`SELECT COUNT(*) n FROM sent_emails WHERE agent_id=? AND sent_at > UTC_TIMESTAMP() - INTERVAL 24 HOUR`, [a.id]);
    const [r] = await q(`SELECT COUNT(*) n FROM received_emails WHERE agent_id=? AND received_at > UTC_TIMESTAMP() - INTERVAL 7 DAY AND from_email NOT LIKE '%@comcast.com'`, [a.id]);
    if (a.status !== 'active' && !s.n) { lines.push([a.name, 'Paused.']); continue; }
    lines.push([a.name, `${s.n} sent in the last day.  ${r.n} replies this week.`]);
  }
  return lines;
}

async function doneYesterday() {
  try {
    return await q(`SELECT topic, note FROM daniel_memory WHERE kind='done' AND created_at > NOW() - INTERVAL 1 DAY AND source NOT LIKE 'seeded%' ORDER BY id`);
  } catch { return []; }
}

async function meetingsAhead(today) {
  const end = addBusinessDays(today, 2);
  try {
    const evs = await calendarEvents(today, end);
    return { ok: true, events: evs.filter(e => !e.isAllDay) };
  } catch { return { ok: false, events: [] }; }
}

// ---------- the model writes the opener and Looking ahead ----------

const AHEAD_PROMPT = `You are Daniel Reyes, Operations Manager at 1Cloud Communications (telecom advisory: internet, voice, SD-WAN from carriers like Comcast Business, ACC Business, Spectrum, Lumen through master agents Telarus and Sandler).  You write the top of Jonathan's morning brief.

Think like a forward-thinking manager: what time of year it is and what that means (budget season, holidays slowing replies and carrier installs, year-end deadlines for bookings and bonuses), carrier lead times against requested install dates, reminders and renewals coming due, stale partner backlogs, security chores best done in quiet weeks.  Use only facts in the data.  If something is unverified, say "check".  No em dashes.  Two spaces after each sentence.  Short.

Answer JSON only: {"opener": "one or two sentences: what matters most today", "ahead": ["3 to 5 items, each with a date or timeframe and a suggested action"]}`;

async function lookingAhead(data) {
  try {
    const model = process.env.DANIEL_LIGHT_MODEL || 'claude-sonnet-5-5';
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model, max_tokens: 4000, output_config: { effort: 'low' },
      system: AHEAD_PROMPT, messages: [{ role: 'user', content: JSON.stringify(data) }],
    });
    const { logUsage } = await import('./daniel.js');
    logUsage('brief', model, { input: res.usage?.input_tokens, output: res.usage?.output_tokens });
    const m = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').match(/\{[\s\S]*\}/);
    const o = m ? JSON.parse(m[0]) : {};
    return { opener: noDash(o.opener || ''), ahead: (Array.isArray(o.ahead) ? o.ahead : []).map(noDash).slice(0, 5) };
  } catch (e) {
    console.error('[Daniel brief] looking ahead failed:', e.message);
    return { opener: '', ahead: [] };
  }
}

// ---------- render ----------

const H = (t, color = '#1e293b') => `<h3 style="font-size:15px;margin:18px 0 6px;color:${color}">${t}</h3>`;
const UL = items => `<ul style="margin:0 0 0 18px;padding:0">${items.map(i => `<li style="margin-bottom:6px">${i}</li>`).join('')}</ul>`;

export function renderBrief(b) {
  const parts = ['<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:660px">', '<p>Good morning Jonathan,</p>'];
  if (b.opener) parts.push(`<p>${esc(b.opener)}</p>`);

  const needs = [
    ...b.due.map(i => `${i.overdue ? '<b>Overdue:</b> ' : ''}${esc(first(TEAM[i.who]?.name || i.who))}: ${esc(i.what)}  <span style="color:#64748b">(${esc(i.subject)})</span>`),
    ...b.replies.map(r => `<b>${esc(r.company || '')}</b>, ${esc(`${r.first_name || ''} ${r.last_name || ''}`.trim())} (${esc(r.sentiment.replace('_', ' '))}, to ${esc(first(r.agent))}): "${esc(String(r.said || '').replace(/\s+/g, ' ').slice(0, 120))}"  Reply from the sales platform Inbox.`),
    ...(b.waiting || []).map(a => `<b>Waiting for your OK:</b> ${esc(a.summary)}  <span style="color:#64748b">(Approve in Teams, or reply yes on my email)</span>`),
    ...b.approvals.map(a => `<b>${esc(a.company || '')}</b>: switch the cadence to ${esc(a.new_name || '')}${a.new_title ? ', ' + esc(a.new_title) : ''}?  Tell me "approve" in Teams, or approve in the sales platform.`),
  ];
  parts.push(H(`Needs you (${needs.length})`, '#b45309'), needs.length ? UL(needs) : '<p>Nothing today.</p>');

  if (b.meetings.ok) {
    const lines = b.meetings.events.map(e => `${esc(dayLabel(String(e.start?.dateTime).slice(0, 10)))}, ${esc(String(e.start?.dateTime).slice(11, 16))} CT: ${esc(e.subject || '(no subject)')}${isOutsideMeeting(e) ? '' : ' <span style="color:#64748b">(internal)</span>'}`);
    parts.push(H('Meetings, next 3 business days'), lines.length ? UL(lines) : '<p>Nothing on the calendar.</p>');
  }

  if (b.done.length) parts.push(H('Done for you'), UL(b.done.map(d => `${esc(d.topic)}: ${esc(d.note)}`)));

  const alarms = b.health.filter(h => h.level === 'alarm'), notes = b.health.filter(h => h.level === 'note');
  parts.push(H('Health check'), UL([
    ...alarms.map(h => `<b style="color:#b91c1c">${esc(h.text)}</b>`),
    ...notes.map(h => esc(h.text)),
    ...(alarms.length ? [] : ['Sending, reply sorting and the API are working.']),
  ]));

  parts.push(H('Team'), `<table style="border-collapse:collapse;font-size:14px">${b.team.map(([n, t]) => `<tr><td style="padding:2px 16px 2px 0"><b>${esc(n)}</b></td><td>${esc(t)}</td></tr>`).join('')}</table>`);

  const tri = renderTriage(b.triage);
  if (tri) parts.push(H('Your inbox'), `<p>${tri}</p>`);

  if (b.ahead.length) parts.push(H('Looking ahead', '#0e7490'), UL(b.ahead.map(esc)));

  parts.push('<p style="margin-top:18px">Reply "done" on my original email for anything finished, or tell me in Teams.</p>', '<p>Daniel Reyes<br>Operations Manager, 1Cloud Communications</p></div>');
  return parts.join('\n');
}

// ---------- send ----------

export async function buildBrief(now = new Date()) {
  const today = todayISO(now);
  const [rows, replies, approvals, team, done, meetings, health] = await Promise.all([
    q(`SELECT id, message_id, conversation_id, subject, status, plan_json FROM daniel_requests WHERE plan_json IS NOT NULL OR status='done'`).catch(() => []),
    repliesWaiting(), approvalsWaiting(), teamLines(), doneYesterday(), meetingsAhead(today), healthForBrief(now),
  ]);
  const due = dueItems(rows, today);
  const { pendingActions } = await import('./danielActions.js');
  const waiting = await pendingActions().catch(() => []);
  const { triageForList } = await import('./danielTriage.js');
  const triage = await triageForList().catch(() => null);
  const [notes] = await pool.execute(`SELECT kind, topic, note FROM daniel_memory WHERE kind IN ('fact','done') ORDER BY id DESC LIMIT 40`).catch(() => [[]]);
  let upcoming = [];
  try { upcoming = (await calendarEvents(today, addBusinessDays(today, 10))).map(e => `${String(e.start?.dateTime).slice(0, 16)} ${e.subject}`); } catch { /* calendar not connected */ }
  const { opener, ahead } = await lookingAhead({
    today: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }),
    due_today: due, replies_waiting: replies.length, approvals_waiting: approvals.length, health, team,
    calendar_next_two_weeks: upcoming, notes,
  });
  return { opener, due, replies, approvals, waiting, meetings, done, health, team, triage, ahead };
}

export async function sendBrief(now = new Date()) {
  if (!ON()) return 0;
  const today = todayISO(now);
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_digests (digest_date DATE PRIMARY KEY, sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const [claimed] = await pool.execute(`INSERT IGNORE INTO daniel_digests (digest_date) VALUES (?)`, [today]);
  if (claimed.affectedRows !== 1) return 0;   // already sent today
  try {
    const b = await buildBrief(now);
    await sendMail({ fromEmail: DANIEL_MAILBOX, to: OWNER_EMAIL, subject: `Morning brief, ${dayLabel(today)}`, html: renderBrief(b) });
    console.log('[Daniel brief] sent');
    return 1;
  } catch (e) {
    await pool.execute('DELETE FROM daniel_digests WHERE digest_date=?', [today]);   // let the next try go
    throw e;
  }
}
