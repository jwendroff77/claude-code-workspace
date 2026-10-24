// Run: node --test server/tests/daniel.test.js   (no network, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBoss, isTrustedSender, splitForward, isApproval, parsePlan, renderPlanHtml, htmlToText, isProtected, pickAttachments, isDone, dueItems, renderDueList, todayISO } from '../services/daniel.js';

const msgFrom = (addr, headers = []) => ({ from: { emailAddress: { address: addr } }, internetMessageHeaders: headers });

test('only Jonathan is the boss', () => {
  assert.equal(isBoss('Jonathan@1cloudcommunications.com'), true);
  assert.equal(isBoss('jonathan@1cloudnow.com'), true);
  assert.equal(isBoss('steven_filek@comcast.com'), false);
  assert.equal(isBoss(''), false);
});

test('a spoofed From: Jonathan is not trusted', () => {
  assert.equal(isTrustedSender(msgFrom('jonathan@1cloudcommunications.com', [])), false);
  assert.equal(isTrustedSender(msgFrom('jonathan@1cloudcommunications.com', [{ name: 'Authentication-Results', value: 'spf=fail; dmarc=fail' }])), false);
});

test('internal or DMARC-pass mail from Jonathan is trusted', () => {
  assert.equal(isTrustedSender(msgFrom('jonathan@1cloudcommunications.com', [{ name: 'X-MS-Exchange-Organization-AuthAs', value: 'Internal' }])), true);
  assert.equal(isTrustedSender(msgFrom('jonathan@1cloudnow.com', [{ name: 'Authentication-Results', value: 'spf=pass; dkim=pass; dmarc=pass action=none' }])), true);
  assert.equal(isTrustedSender(msgFrom('someone@else.com', [{ name: 'X-MS-Exchange-Organization-AuthAs', value: 'Internal' }])), false);
});

test('splits his note from the forwarded email', () => {
  const t = 'Get Jenna on this please\n\n________________________________\nFrom: ACC Business <billing@acc.com>\nSent: Monday\nYour invoice is attached.';
  const r = splitForward(t);
  assert.equal(r.note, 'Get Jenna on this please');
  assert.match(r.forwarded, /Your invoice is attached/);
  assert.deepEqual(splitForward('Just a note, nothing forwarded'), { note: 'Just a note, nothing forwarded', forwarded: '' });
  assert.equal(splitForward('---------- Forwarded message ---------\nFrom: x').note, '');
});

test('approval replies', () => {
  for (const y of ['Yes', 'yes, send it', 'Send it', 'OK', 'Approved.', 'looks good']) assert.equal(isApproval(y), true, y);
  for (const n of ['Yes but change the date', 'No', 'wait', 'Change the subject', 'ok hold off', '']) assert.equal(isApproval(n), false, n);
});

test('plan parsing keeps only safe, valid parts', () => {
  const p = parsePlan('Here you go {"summary":"ACC double billed Big Green Egg.","owner":"jenna","steps":[{"who":"jenna","what":"Open a dispute","due":"2026-10-27"},{"who":"nobody","what":"x","due":"soon"}],"draft":{"from":"jenna","to":["billing@acc.com","not an email"],"cc":[],"subject":"Big Green Egg ACC Bills","body":"Hello,\\nHere is what we need."},"questions":["Which month?"],"flags":[]}');
  assert.equal(p.owner, 'jenna');
  assert.equal(p.steps.length, 2);
  assert.equal(p.steps[1].who, 'jenna');      // unknown person falls back to the owner
  assert.equal(p.steps[1].due, null);         // bad date dropped
  assert.deepEqual(p.draft.to, ['billing@acc.com']);
  assert.equal(parsePlan('no json here'), null);
});

test('a draft from someone who cannot send is dropped', () => {
  const p = parsePlan('{"summary":"x","owner":"kayla","steps":[],"draft":{"from":"kayla","to":["a@b.com"],"subject":"s","body":"b"}}');
  assert.equal(p.draft, null);
});

test('plan email: no em dashes, says sending is off while testing', () => {
  const p = parsePlan('{"summary":"Lisa at ITEX needs a check-in.","owner":"daniel","steps":[{"who":"daniel","what":"Draft the check-in","due":"2026-10-26"}],"draft":{"from":"daniel","to":["lisa@itex.com"],"subject":"Port Arthur sites","body":"Hi Lisa,\\nHow did it go?"}}');
  const html = renderPlanHtml(p, { sendingOn: false });
  assert.match(html, /^Got it\./);
  assert.match(html, /switched off while we test/);
  assert.match(html, /Mon, Oct 26/);
  assert.ok(!html.includes('—'));
  assert.match(renderPlanHtml(p, { sendingOn: true }), /Reply <b>yes<\/b>/);
});

test('no em or en dashes survive in anything Daniel writes', () => {
  const p = parsePlan('{"summary":"The body did not come through — only the wrapper.","owner":"daniel","steps":[{"who":"daniel","what":"Ask – nicely","due":null}]}');
  assert.ok(!/[—–]/.test(JSON.stringify(p)));
  assert.equal(p.summary, 'The body did not come through, only the wrapper.');
  if (p.steps[1]) assert.equal(p.steps[1].what, 'Owner, not care');
});

test('never drafts an email to Jonathan or the team', () => {
  const p = parsePlan('{"summary":"x","owner":"daniel","steps":[],"draft":{"from":"daniel","to":["jonathan@1cloudcommunications.com"],"subject":"s","body":"b"}}');
  assert.equal(p.draft, null);
  const q = parsePlan('{"summary":"x","owner":"jenna","steps":[],"draft":{"from":"jenna","to":["holson@1cloudcommunications.com","billing@acc.com"],"subject":"s","body":"b"}}');
  assert.deepEqual(q.draft.to, ['holson@1cloudcommunications.com', 'billing@acc.com']);
});

test('spots encrypted (protected) mail', () => {
  assert.equal(isProtected({ internetMessageHeaders: [{ name: 'Content-Class', value: 'rpmsg.message' }] }), true);
  assert.equal(isProtected({ bodyPreview: 'Jonathan Wendroff (jonathan@1cloudcommunications.com) has sent you a protected message.' }), true);
  assert.equal(isProtected({ bodyPreview: 'Hi Daniel', internetMessageHeaders: [] }), false);
});

test('html to text', () => {
  assert.equal(htmlToText('<p>Hi&nbsp;there</p><p>Line 2</p>'), 'Hi there\nLine 2');
});

test('reads attached screenshots and PDFs, skips logos and odd files', () => {
  const att = (o) => ({ '@odata.type': '#microsoft.graph.fileAttachment', isInline: false, size: 1000, contentBytes: 'AAAA', ...o });
  const out = pickAttachments([
    att({ contentType: 'application/pdf', name: 'bill.pdf' }),
    att({ contentType: 'image/png', name: 'shot.png' }),
    att({ contentType: 'image/png', name: 'logo.png', isInline: true }),
    att({ contentType: 'application/x-microsoft-rpmsg-message', name: 'message.rpmsg' }),
    att({ contentType: 'application/pdf', name: 'huge.pdf', size: 20 * 1024 * 1024 }),
  ]);
  assert.deepEqual(out.map(o => o.type), ['document', 'image']);
});

test('double-hyphen dashes are cleaned too', () => {
  const p = parsePlan('{"summary":"Need a named owner -- not just care agents.","owner":"jenna","steps":[]}');
  assert.equal(p.summary, 'Need a named owner, not just care agents.');
});

test('"done" replies', () => {
  for (const y of ['Done', 'done, thanks', 'All set', 'Resolved.', 'taken care of']) assert.equal(isDone(y), true, y);
  for (const n of ['not done yet', 'Yes', 'Is this done?', '']) assert.equal(isDone(n), false, n);
});

test('8am list: due today and overdue, newest plan per thread, done threads dropped', () => {
  const plan = steps => JSON.stringify({ summary: 's', owner: 'daniel', steps });
  const rows = [
    { id: 1, conversation_id: 'A', subject: 'ITEX', status: 'planned', plan_json: plan([{ who: 'jonathan', what: 'Old plan step', due: '2026-10-26' }]) },
    { id: 2, conversation_id: 'A', subject: 'ITEX', status: 'planned', plan_json: plan([{ who: 'jonathan', what: 'Call Lisa', due: '2026-10-26' }, { who: 'daniel', what: 'Later thing', due: '2026-11-02' }]) },
    { id: 3, conversation_id: 'B', subject: 'Big Green Egg', status: 'awaiting_approval', plan_json: plan([{ who: 'jenna', what: 'Chase ACC', due: '2026-10-23' }]) },
    { id: 4, conversation_id: 'C', subject: 'Finished', status: 'planned', plan_json: plan([{ who: 'jonathan', what: 'Should not show', due: '2026-10-20' }]) },
    { id: 5, conversation_id: 'C', subject: 'Finished', status: 'done', plan_json: null },
    { id: 6, conversation_id: 'D', subject: 'No date', status: 'planned', plan_json: plan([{ who: 'daniel', what: 'Someday', due: null }]) },
  ];
  const items = dueItems(rows, '2026-10-26');
  assert.deepEqual(items.map(i => i.what), ['Chase ACC', 'Call Lisa']);
  assert.equal(items[0].overdue, true);
  const html = renderDueList(items);
  assert.match(html, /Overdue<\/b> \(was due Fri, Oct 23\)/);
  assert.ok(!/[—–]/.test(html));
});

test('today is computed in Central time', () => {
  assert.equal(todayISO(new Date('2026-10-27T03:30:00Z')), '2026-10-26');   // 10:30pm Monday in Minnesota
});

test('inbox reader: verdicts, labels, team mail skipped', async () => {
  const { parseVerdict, labelFor, isFromTeam } = await import('../services/danielTriage.js');
  const v = parseVerdict('{"category":"business","needs_action":true,"owner":"jenna","urgency":"today","why":"ACC bill missing — again"}');
  assert.equal(labelFor(v), 'Daniel: Jenna');
  assert.equal(v.why, 'ACC bill missing, again');
  assert.equal(labelFor(parseVerdict('{"category":"business","needs_action":true,"owner":"jonathan","urgency":"today","why":"sign"}')), 'Daniel: Needs you');
  assert.equal(labelFor(parseVerdict('{"category":"business","needs_action":false,"owner":"daniel","urgency":"fyi","why":"x"}')), 'Daniel: FYI');
  assert.equal(labelFor(parseVerdict('{"category":"personal","needs_action":true,"owner":"jenna"}')), null);
  assert.equal(parseVerdict('{"category":"personal","needs_action":true}').needs_action, false);
  assert.equal(parseVerdict('{"category":"weird"}'), null);
  assert.equal(parseVerdict('{"category":"business","owner":"bob"}').owner, 'jonathan');
  assert.equal(isFromTeam('DReyes@1cloudcommunications.com'), true);
  assert.equal(isFromTeam('steven_filek@comcast.com'), false);
});

test('8am list shows the inbox section and still sends with nothing due', () => {
  const tri = { mode: 'watch', total: 38, items: [{ owner: 'jenna', urgency: 'today', subject: 'ACC invoice', from_email: 'billing@acc.com', why: 'Bill missing' }] };
  const html = renderDueList([], tri);
  assert.match(html, /Nothing is due today/);
  assert.match(html, /watch-only, I did nothing\): 38 emails, 1 need someone/);
  assert.match(html, /Jenna <b>\(today\)<\/b>: ACC invoice/);
  assert.ok(!/[—–]/.test(html));
});

test('business days and Central time for the brief and prep', async () => {
  const { addBusinessDays } = await import('../services/danielMeetings.js');
  assert.equal(addBusinessDays('2026-10-26', 2), '2026-10-28');   // Mon -> Wed
  assert.equal(addBusinessDays('2026-10-23', 2), '2026-10-27');   // Fri -> Tue
  assert.equal(addBusinessDays('2026-10-29', 2), '2026-11-02');   // Thu -> Mon
  const { centralNow } = await import('../services/danielHealth.js');
  assert.deepEqual(centralNow(new Date('2026-10-26T13:05:00Z')), { hour: 8, weekday: 'Mon', isWeekday: true });
  assert.equal(centralNow(new Date('2026-10-25T15:00:00Z')).isWeekday, false);
});

test('meeting prep parsing', async () => {
  const { parsePrep, renderPrep } = await import('../services/danielMeetings.js');
  assert.deepEqual(parsePrep('{"already_sent": true}'), { already_sent: true });
  const p = parsePrep('{"company":"Krevolin — Horst","who":["Ben Winstead"],"about":"Law firm.","told_us":[],"angle":"Backup line.","questions":["Who is your carrier?"],"goal":"Get a bill."}');
  assert.equal(p.company, 'Krevolin, Horst');
  const html = renderPrep({ subject: 'Intro', start: { dateTime: '2026-10-28T12:00:00.0000000' } }, p);
  assert.match(html, /12:00 CT/);
  assert.match(html, /Questions to ask/);
  assert.equal(parsePrep('nothing'), null);
});

test('brief renders every section without em dashes', async () => {
  const { renderBrief } = await import('../services/danielBrief.js');
  const html = renderBrief({
    opener: 'Two meetings Wednesday.', due: [{ who: 'jonathan', what: 'Check invite', subject: 'Krevolin', overdue: false }],
    replies: [{ sentiment: 'meeting_request', company: 'Acme', first_name: 'A', last_name: 'B', agent: 'Kayla Pierce', said: 'Tuesday works' }],
    approvals: [{ company: 'Provident Title', new_name: 'Scott Hernandez', new_title: 'CFO' }],
    meetings: { ok: true, events: [{ subject: 'Krevolin', start: { dateTime: '2026-10-28T12:00:00' }, attendees: [{ emailAddress: { address: 'ben@khlawfirm.com' } }] }] },
    done: [{ topic: 'Memphis Health Center', note: 'Cadence stopped.' }],
    health: [{ level: 'note', text: 'Kate is idle.' }], team: [['Kayla Pierce', '175 sent.']],
    triage: null, ahead: ['Budgets lock by mid-November.'],
  });
  for (const s of ['Needs you (3)', 'Meetings, next 3 business days', 'Done for you', 'Health check', 'Sending, reply sorting and the API are working', 'Looking ahead', 'Provident Title']) assert.ok(html.includes(s), s);
  assert.ok(!/[—–]/.test(html));
});
