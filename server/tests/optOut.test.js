// Run: node --test server/tests/optOut.test.js
// "Not a fit? Unsubscribe here" line on partner cadence emails (17 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UNSUB_URL = 'https://example.test/api/unsubscribe/';
const { optOutLine, withOptOut } = await import('../services/optOut.js');
const { verifyLink } = await import('../services/linkSecret.js');

test('adds the line with a signed link for this prospect', () => {
  const html = withOptOut('Kayla Pierce<br>www.1cloudcommunications.com', 13473, 'justin@example.com');
  assert.match(html, /^Kayla Pierce<br>www\.1cloudcommunications\.com<br><br><span/);
  assert.match(html, /Not a fit\?&nbsp; <a href="https:\/\/example\.test\/api\/unsubscribe\/[A-Za-z0-9_-]+"/);
  assert.match(html, />Unsubscribe here<\/a> and we won't reach out again\.<\/span>$/);
  assert.ok(!html.includes('unsubscribe//'), 'no double slash from a trailing slash in UNSUB_URL');
  const token = html.match(/unsubscribe\/([A-Za-z0-9_-]+)"/)[1];
  const [pid, hmac] = Buffer.from(token, 'base64url').toString().split(':');
  assert.equal(pid, '13473');
  assert.equal(verifyLink('13473:justin@example.com', hmac, 16), true);
  assert.equal(verifyLink('13473:someone-else@example.com', hmac, 16), false);
});

test('no prospect or email: no line, body untouched', () => {
  assert.equal(optOutLine(null, 'a@b.com'), '');
  assert.equal(optOutLine(5, ''), '');
  assert.equal(withOptOut('Hi', null, null), 'Hi');
});

test('a localhost UNSUB_URL is never used in an email', async () => {
  process.env.UNSUB_URL = 'http://localhost:3001/api/unsubscribe';
  const m = await import('../services/optOut.js?local');
  assert.match(m.optOutLine(7, 'a@b.com'), /href="https:\/\/claude-code-workspace-production\.up\.railway\.app\/api\/unsubscribe\//);
});
