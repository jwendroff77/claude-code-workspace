// Daniel's tools: look things up (sales platform, team mailboxes, the web) and remember.
// Everything here is read-only except remember(), which writes to Daniel's own notes table.
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import pool from '../db/connection.js';

// Mailboxes Daniel may search.  Jonathan's own inbox is not here on purpose (that is a later phase).
export const MAILBOXES = {
  daniel: 'dreyes@1cloudcommunications.com',
  hannah: 'holson@1cloudcommunications.com',
  jenna: 'jwalsh@1cloudnow.com',
  kayla: 'kpierce@1cloudnow.com',
  megan: 'mbarrett@1cloudnow.com',
  lauren: 'lmitchell@1cloudnow.com',
  kate: 'kharmon@1cloudnow.com',
  scott: 'smercer@1cloudnow.com',
};

const MAX_RESULT = 9000;   // characters per tool result
const cap = s => (s.length > MAX_RESULT ? s.slice(0, MAX_RESULT) + '\n[cut off]' : s);

export function cleanText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n')
    .trim();
}

// Keep only the newest message of a reply chain: everything from the first quoted header on is history.
export function newestPart(text) {
  const m = String(text).search(/\n(From: .+\nSent: |-{2,}\s*Original Message|_{8,}|On .{6,80} wrote:)/);
  return m > 0 ? String(text).slice(0, m).trim() : String(text).trim();
}

// ---------- tool definitions (sent to Claude) ----------

export const TOOL_DEFS = [
  {
    name: 'lookup_company',
    description: 'Search the sales platform for a company (prospect records, which rep and Comcast partner are on it, cadence status, and the latest emails sent and received).  Use the company name as it would appear, a partial name is fine.',
    input_schema: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'], additionalProperties: false },
  },
  {
    name: 'lookup_person',
    description: 'Search the sales platform for a person by email address or name.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'email address or "First Last"' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'search_mailbox',
    description: `Search one team mailbox (inbox and sent) for emails.  Returns subject, from, to, cc, date and the newest part of each message.  Mailboxes: ${Object.keys(MAILBOXES).join(', ')}.  Kayla's mailbox holds the Comcast partner threads with Steven Filek.  Use get_email for a full message.`,
    input_schema: {
      type: 'object',
      properties: { mailbox: { type: 'string', enum: Object.keys(MAILBOXES) }, query: { type: 'string', description: 'words to search for, e.g. a company name or person' } },
      required: ['mailbox', 'query'], additionalProperties: false,
    },
  },
  {
    name: 'get_email',
    description: 'Read one full email (newest part plus the quoted history) by the id that search_mailbox returned.',
    input_schema: { type: 'object', properties: { mailbox: { type: 'string', enum: Object.keys(MAILBOXES) }, id: { type: 'string' } }, required: ['mailbox', 'id'], additionalProperties: false },
  },
  {
    name: 'get_calendar',
    description: "Read Jonathan's Outlook calendar between two dates (Central time, at most 31 days).  Returns each meeting with time, subject, organizer, attendees, location and whether it is online.",
    input_schema: {
      type: 'object',
      properties: { start: { type: 'string', description: 'YYYY-MM-DD' }, end: { type: 'string', description: 'YYYY-MM-DD, inclusive' } },
      required: ['start', 'end'], additionalProperties: false,
    },
  },
  {
    name: 'recall',
    description: "Search your own notes: what the team already did, decisions, Jonathan's preferences, facts about customers and partners, and earlier requests Jonathan sent you.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'company, person or topic' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'remember',
    description: "Save a note for the future.  kind: 'fact' (about a customer, partner or deal), 'done' (something the team completed, with the date), 'preference' (how Jonathan wants things done, learned from his corrections).  One short, specific sentence.",
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['fact', 'done', 'preference'] }, topic: { type: 'string', description: 'company, person or subject' }, note: { type: 'string' } },
      required: ['kind', 'topic', 'note'], additionalProperties: false,
    },
  },
];

// ---------- implementations ----------

let graph = null;
function g() {
  if (graph) return graph;
  const credential = new ClientSecretCredential(process.env.MS_TENANT_ID, process.env.MS_CLIENT_ID, process.env.MS_CLIENT_SECRET);
  graph = Client.initWithMiddleware({ authProvider: new TokenCredentialAuthenticationProvider(credential, { scopes: ['https://graph.microsoft.com/.default'] }) });
  return graph;
}

let memoryReady = false;
export async function ensureMemoryTable() {
  if (memoryReady) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS daniel_memory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL DEFAULT 'fact',
    topic VARCHAR(255) NOT NULL,
    note TEXT NOT NULL,
    source VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(kind), INDEX(topic)
  )`);
  memoryReady = true;
}

const fmtDate = d => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '');

async function prospectSummary(rows) {
  const out = [];
  for (const p of rows.slice(0, 6)) {
    const [[agent]] = await pool.execute('SELECT name FROM agents WHERE id=(SELECT agent_id FROM sent_emails WHERE prospect_id=? ORDER BY sent_at DESC LIMIT 1)', [p.id]);
    const [enr] = await pool.execute(
      `SELECT e.status, e.current_step, a.name rep, pa.name partner FROM partner_enrollments e
       LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN agents pa ON pa.id=e.partner_agent_id WHERE e.prospect_id=?`, [p.id]);
    const [sent] = await pool.execute('SELECT sent_at, subject FROM sent_emails WHERE prospect_id=? ORDER BY sent_at DESC LIMIT 3', [p.id]);
    const [recv] = await pool.execute('SELECT received_at, from_email, sentiment, LEFT(body_text, 400) b FROM received_emails WHERE prospect_id=? ORDER BY received_at DESC LIMIT 4', [p.id]);
    out.push([
      `${p.first_name || ''} ${p.last_name || ''}, ${p.title || ''} at ${p.company || ''} <${p.email || ''}>  phone ${p.phone || 'n/a'}  ${p.city || ''} ${p.state || ''}  status: ${p.status}`,
      enr.length ? 'Cadences: ' + enr.map(e => `${e.rep || '?'} + ${e.partner || 'no partner'}, step ${e.current_step}, ${e.status}`).join('; ') : (agent ? `Last emailed by ${agent.name}` : 'No cadence'),
      ...sent.map(s => `  sent ${fmtDate(s.sent_at)}: ${s.subject}`),
      ...recv.map(r => `  received ${fmtDate(r.received_at)} from ${r.from_email} (${r.sentiment}): ${String(r.b || '').replace(/\s+/g, ' ').slice(0, 300)}`),
    ].join('\n'));
  }
  return out.join('\n\n') + (rows.length > 6 ? `\n\n(${rows.length - 6} more not shown)` : '');
}

async function lookupCompany({ company }) {
  const q = String(company || '').trim();
  if (q.length < 2) return 'Give at least 2 characters.';
  const [rows] = await pool.execute('SELECT * FROM prospects WHERE company LIKE ? ORDER BY updated_at DESC LIMIT 20', [`%${q}%`]);
  if (!rows.length) return `No prospect records match "${q}".  Try a shorter part of the name, or search_mailbox.`;
  return prospectSummary(rows);
}

async function lookupPerson({ query }) {
  const q = String(query || '').trim();
  let rows;
  if (q.includes('@')) [rows] = await pool.execute('SELECT * FROM prospects WHERE email=? LIMIT 5', [q]);
  else {
    const [first, ...rest] = q.split(/\s+/);
    [rows] = await pool.execute('SELECT * FROM prospects WHERE first_name LIKE ? AND last_name LIKE ? LIMIT 10', [`${first}%`, `${rest.join(' ') || ''}%`]);
  }
  if (!rows.length) return `No prospect records match "${q}".`;
  return prospectSummary(rows);
}

function summarizeMessage(m) {
  const addr = list => (list || []).map(x => x.emailAddress?.name ? `${x.emailAddress.name} <${x.emailAddress.address}>` : x.emailAddress?.address).join(', ');
  const protectedMsg = /has sent you a protected message/i.test(m.bodyPreview || '');
  const body = protectedMsg ? '[encrypted message, cannot be read]' : newestPart(cleanText(m.body?.content || m.bodyPreview || '')).slice(0, 1200);
  return `id: ${m.id}\ndate: ${fmtDate(m.receivedDateTime)}\nfrom: ${addr([m.from])}\nto: ${addr(m.toRecipients)}\ncc: ${addr(m.ccRecipients)}\nsubject: ${m.subject}\n${body}`;
}

async function searchMailbox({ mailbox, query }) {
  const mb = MAILBOXES[mailbox];
  if (!mb) return `Unknown mailbox.  Use one of: ${Object.keys(MAILBOXES).join(', ')}`;
  const q = String(query || '').replace(/["\\]/g, ' ').trim();
  if (!q) return 'Empty search.';
  const res = await g().api(`/users/${mb}/messages`).search(`"${q}"`).top(8)
    .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body').get();
  const msgs = (res.value || []).sort((a, b) => String(b.receivedDateTime).localeCompare(String(a.receivedDateTime)));
  if (!msgs.length) return `Nothing in ${mailbox}'s mailbox for "${q}".`;
  return msgs.map(summarizeMessage).join('\n\n---\n\n');
}

async function getEmail({ mailbox, id }) {
  const mb = MAILBOXES[mailbox];
  if (!mb) return 'Unknown mailbox.';
  const m = await g().api(`/users/${mb}/messages/${encodeURIComponent(id)}`)
    .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body').get();
  if (/has sent you a protected message/i.test(m.bodyPreview || '')) return 'This email is encrypted and cannot be read.';
  return summarizeMessage({ ...m, body: { content: '' } }) + '\n\n' + cleanText(m.body?.content).slice(0, 7000);
}

// ---------- calendar ----------

export const CALENDAR_USER = () => process.env.DANIEL_CALENDAR_USER || 'jonathan@1cloudcommunications.com';
export const INTERNAL_DOMAINS = ['1cloudcommunications.com', '1cloudnow.com'];
const isInternal = addr => INTERNAL_DOMAINS.includes(String(addr || '').toLowerCase().split('@')[1] || '');

// Events between two YYYY-MM-DD dates (inclusive), times in Central.
export async function calendarEvents(start, end) {
  const s = `${start}T00:00:00`;
  const e = new Date(`${end}T00:00:00Z`); e.setUTCDate(e.getUTCDate() + 1);
  const res = await g().api(`/users/${CALENDAR_USER()}/calendarView`)
    .header('Prefer', 'outlook.timezone="Central Standard Time"')
    .query({ startDateTime: s, endDateTime: e.toISOString().slice(0, 19) })
    .select('id,iCalUId,subject,start,end,location,organizer,attendees,isOnlineMeeting,isAllDay,isCancelled,showAs,responseStatus,bodyPreview,webLink')
    .orderby('start/dateTime').top(150).get();
  return (res.value || []).filter(ev => !ev.isCancelled);
}

// A meeting with someone outside 1Cloud that Jonathan has not declined.
export function isOutsideMeeting(ev) {
  if (!ev || ev.isAllDay || ev.isCancelled) return false;
  if (ev.responseStatus?.response === 'declined') return false;
  const people = [ev.organizer?.emailAddress?.address, ...(ev.attendees || []).map(a => a.emailAddress?.address)].filter(Boolean);
  return people.some(a => !isInternal(a));
}

export function describeEvent(ev) {
  const t = d => String(d || '').slice(11, 16);
  const day = new Date(String(ev.start?.dateTime).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const who = (ev.attendees || []).map(a => `${a.emailAddress?.name || ''} <${a.emailAddress?.address || ''}>${a.status?.response && a.status.response !== 'none' ? ' (' + a.status.response + ')' : ''}`).join(', ');
  return `${day} ${ev.isAllDay ? 'all day' : t(ev.start?.dateTime) + '-' + t(ev.end?.dateTime) + ' CT'}: ${ev.subject || '(no subject)'}`
    + `\n  organizer: ${ev.organizer?.emailAddress?.name || ''} <${ev.organizer?.emailAddress?.address || ''}>`
    + (who ? `\n  attendees: ${who}` : '')
    + (ev.location?.displayName ? `\n  location: ${ev.location.displayName}` : '')
    + (ev.isOnlineMeeting ? '\n  online meeting' : '')
    + (ev.responseStatus?.response && ev.responseStatus.response !== 'organizer' ? `\n  Jonathan's response: ${ev.responseStatus.response}` : '')
    + (isOutsideMeeting(ev) ? '\n  outside meeting' : '');
}

const NO_CALENDAR = "I can't read the calendar yet: the platform still needs the Calendars.Read permission in Microsoft.";

async function getCalendar({ start, end }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return 'Use YYYY-MM-DD dates.';
  if ((new Date(end) - new Date(start)) / 864e5 > 31) return 'At most 31 days at a time.';
  try {
    const evs = await calendarEvents(start, end);
    return evs.length ? evs.map(describeEvent).join('\n') : `Nothing on the calendar from ${start} to ${end}.`;
  } catch (e) {
    if (/403|Access is denied|Authorization_RequestDenied|ErrorAccessDenied/i.test(String(e.statusCode) + ' ' + e.message)) return NO_CALENDAR;
    throw e;
  }
}

export async function recall({ query }) {
  await ensureMemoryTable();
  const words = String(query || '').toLowerCase().split(/[^a-z0-9@.&]+/).filter(w => w.length >= 3).slice(0, 6);
  if (!words.length) return 'Give a company, person or topic.';
  const like = words.map(() => '(LOWER(topic) LIKE ? OR LOWER(note) LIKE ?)').join(' OR ');
  const args = words.flatMap(w => [`%${w}%`, `%${w}%`]);
  const [notes] = await pool.execute(`SELECT kind, topic, note, created_at FROM daniel_memory WHERE ${like} ORDER BY created_at DESC LIMIT 20`, args);
  const reqLike = words.map(() => 'LOWER(subject) LIKE ?').join(' OR ');
  const [reqs] = await pool.execute(
    `SELECT subject, status, created_at, plan_json FROM daniel_requests WHERE plan_json IS NOT NULL AND (${reqLike}) ORDER BY id DESC LIMIT 5`, words.map(w => `%${w}%`));
  const parts = [];
  if (notes.length) parts.push('Notes:\n' + notes.map(n => `- [${n.kind}, ${String(n.created_at).slice(4, 15)}] ${n.topic}: ${n.note}`).join('\n'));
  if (reqs.length) parts.push('Earlier requests from Jonathan:\n' + reqs.map(r => {
    let s = ''; try { s = JSON.parse(r.plan_json).summary; } catch { /* ignore */ }
    return `- ${String(r.created_at).slice(4, 15)} "${r.subject}" (${r.status}): ${s}`;
  }).join('\n'));
  return parts.join('\n\n') || `No notes about "${query}".`;
}

export async function remember({ kind, topic, note }, source = null) {
  await ensureMemoryTable();
  const k = ['fact', 'done', 'preference'].includes(kind) ? kind : 'fact';
  if (!String(topic || '').trim() || !String(note || '').trim()) return 'Need a topic and a note.';
  await pool.execute('INSERT INTO daniel_memory (kind, topic, note, source) VALUES (?,?,?,?)',
    [k, String(topic).slice(0, 255), String(note).slice(0, 2000), source ? String(source).slice(0, 255) : null]);
  return 'Saved.';
}

// Jonathan's standing preferences, given to Daniel on every request.
export async function preferences() {
  await ensureMemoryTable();
  const [rows] = await pool.execute(`SELECT note FROM daniel_memory WHERE kind='preference' ORDER BY id`);
  return rows.map(r => '- ' + r.note).join('\n');
}

const IMPL = {
  lookup_company: lookupCompany,
  lookup_person: lookupPerson,
  search_mailbox: searchMailbox,
  get_email: getEmail,
  get_calendar: getCalendar,
  recall,
  remember: (input, ctx) => remember(input, ctx?.source),
};

export async function runTool(name, input, ctx = {}) {
  const fn = IMPL[name];
  if (!fn) return { content: `Unknown tool ${name}`, is_error: true };
  try {
    return { content: cap(String(await fn(input || {}, ctx))) };
  } catch (e) {
    return { content: `Tool failed: ${e.message}`.slice(0, 500), is_error: true };
  }
}
