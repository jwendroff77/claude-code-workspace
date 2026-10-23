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
