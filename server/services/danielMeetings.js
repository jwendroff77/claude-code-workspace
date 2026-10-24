// Meeting prep, 2 business days ahead, for every outside meeting on Jonathan's calendar.
// Runs weekdays at 7:30am CT.  Skips meetings already prepped (his notes say so) and internal meetings.
import pool from '../db/connection.js';
import { sendMail } from './graph.js';
import { runAgent, systemPrompt, todayCT, ON } from './daniel.js';
import { calendarEvents, isOutsideMeeting, describeEvent, remember, preferences } from './danielTools.js';

const DANIEL_MAILBOX = (process.env.DANIEL_MAILBOX || 'dreyes@1cloudcommunications.com').toLowerCase();
const OWNER_EMAIL = 'jonathan@1cloudcommunications.com';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+--+\s+/g, ', ');

// YYYY-MM-DD plus n business days (Mon-Fri).
export function addBusinessDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const PREP_RULES = `

MEETING PREP
Ignore the plan JSON format above.  Write prep for one meeting on Jonathan's calendar.
- Look first: recall (your notes on the company and people), lookup_company / lookup_person (use the attendees' email domains), search_mailbox kayla (Comcast partner threads), then at most one or two web searches for company basics if your notes are thin.
- If your notes say prep for this meeting was already sent, answer {"already_sent": true}.
- If it is not a sales, customer, carrier or partner meeting (for example a personal appointment or a vendor demo), keep it to two lines.
- Be specific and short.  No em dashes.  Two spaces after each sentence.

Answer JSON only:
{"already_sent": false,
 "company": "...",
 "who": ["Name, title, contact, one line on their role in this"],
 "about": "two or three sentences on the company",
 "told_us": ["what they have said so far, quoted when useful"],
 "angle": "how 1Cloud helps and what to lead with",
 "questions": ["3 to 5 questions to ask"],
 "goal": "what a good outcome of this call is",
 "watch_out": "optional, one line"}`;

export function parsePrep(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (o.already_sent === true) return { already_sent: true };
  if (!o.company && !o.about) return null;
  const list = v => (Array.isArray(v) ? v.map(noDash).filter(Boolean) : []);
  return { already_sent: false, company: noDash(o.company || ''), who: list(o.who), about: noDash(o.about || ''), told_us: list(o.told_us), angle: noDash(o.angle || ''), questions: list(o.questions), goal: noDash(o.goal || ''), watch_out: noDash(o.watch_out || '') };
}

export function renderPrep(ev, p) {
  const time = `${String(ev.start?.dateTime).slice(11, 16)} CT`;
  const ul = items => `<ul style="margin:0 0 10px 18px;padding:0">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  const ol = items => `<ol style="margin:0 0 10px 18px;padding:0">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
  return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:16px 0">`
    + `<h3 style="font-size:16px;margin:0 0 2px">${esc(p.company || ev.subject)}</h3>`
    + `<p style="margin:0 0 10px;color:#64748b"><b style="color:#1e293b">${esc(time)}</b>  ${esc(ev.subject || '')}</p>`
    + (p.who.length ? `<p style="margin:0 0 4px"><b>Who</b></p>${ul(p.who)}` : '')
    + (p.about ? `<p style="margin:0 0 4px"><b>The company</b></p><p style="margin:0 0 10px">${esc(p.about)}</p>` : '')
    + (p.told_us.length ? `<p style="margin:0 0 4px"><b>What they told us</b></p>${ul(p.told_us)}` : '')
    + (p.angle ? `<p style="margin:0 0 4px"><b>Our angle</b></p><p style="margin:0 0 10px">${esc(p.angle)}</p>` : '')
    + (p.questions.length ? `<p style="margin:0 0 4px"><b>Questions to ask</b></p>${ol(p.questions)}` : '')
    + (p.goal ? `<p style="margin:0"><b>Goal for the call:</b> ${esc(p.goal)}</p>` : '')
    + (p.watch_out ? `<p style="margin:8px 0 0;color:#b45309"><b>Watch out:</b> ${esc(p.watch_out)}</p>` : '')
    + `</div>`;
}

let ready = false;
async function ensureTable() {
  if (ready) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_meeting_prep (
    event_key VARCHAR(255) PRIMARY KEY, subject VARCHAR(500), start_at VARCHAR(40), status VARCHAR(20) DEFAULT 'working',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  ready = true;
}

export async function prepUpcomingMeetings(now = new Date()) {
  if (!ON()) return 0;
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const target = addBusinessDays(today, 2);
  let events;
  try { events = await calendarEvents(target, target); } catch (e) {
    console.log(`[Daniel meetings] calendar not readable: ${e.message}`);
    return 0;
  }
  await ensureTable();
  const sections = [];
  for (const ev of events.filter(isOutsideMeeting)) {
    const key = `${ev.iCalUId || ev.id}|${ev.start?.dateTime}`.slice(0, 255);
    const [claim] = await pool.execute('INSERT IGNORE INTO daniel_meeting_prep (event_key, subject, start_at) VALUES (?,?,?)', [key, (ev.subject || '').slice(0, 500), ev.start?.dateTime]);
    if (claim.affectedRows !== 1) continue;   // prepped before
    try {
      const prefs = await preferences().catch(() => '');
      const messages = [{ role: 'user', content: `Today is ${todayCT()}.\n${prefs ? `Jonathan's standing preferences:\n${prefs}\n` : ''}\nThe meeting:\n${describeEvent(ev)}\n\nInvite text:\n<email>\n${String(ev.bodyPreview || '').slice(0, 1500)}\n</email>` }];
      const p = await runAgent({ systemText: systemPrompt() + PREP_RULES, messages, parse: parsePrep, source: 'meeting prep', what: 'meeting prep' });
      if (p.already_sent) { await pool.execute(`UPDATE daniel_meeting_prep SET status='already_sent' WHERE event_key=?`, [key]); continue; }
      sections.push({ ev, p });
      await pool.execute(`UPDATE daniel_meeting_prep SET status='prepped' WHERE event_key=?`, [key]);
    } catch (e) {
      console.error(`[Daniel meetings] prep failed for "${ev.subject}": ${e.message}`);
      await pool.execute(`UPDATE daniel_meeting_prep SET status='error' WHERE event_key=?`, [key]);
    }
  }
  if (!sections.length) return 0;
  const day = new Date(target + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const names = sections.map(s => s.p.company || s.ev.subject).join(', ');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:660px">`
    + `<p>Hi Jonathan,</p><p>${sections.length === 1 ? 'One outside meeting' : sections.length + ' outside meetings'} on ${esc(day)}.  Here is what you need for each.</p>`
    + sections.map(s => renderPrep(s.ev, s.p)).join('')
    + `<p style="margin-top:18px">Daniel Reyes<br>Operations Manager, 1Cloud Communications</p></div>`;
  await sendMail({ fromEmail: DANIEL_MAILBOX, to: OWNER_EMAIL, subject: `Meeting prep: ${day} (${names})`.slice(0, 200), html });
  for (const s of sections) {
    await remember({ kind: 'done', topic: s.p.company || s.ev.subject, note: `Meeting prep for ${day} ("${s.ev.subject}") was emailed to Jonathan on ${todayCT()}.` }).catch(() => {});
  }
  console.log(`[Daniel meetings] sent prep for ${sections.length} meeting(s) on ${target}`);
  return sections.length;
}
