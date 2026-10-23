// Run: node --test server/tests/teams.test.js   (no network, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

process.env.TEAMS_BOT_APP_ID = 'bot-app-id-123';
const { verifyIncoming, draftCard, SERVICE_URL_OK } = await import('../routes/teams.js');
const { parseChat } = await import('../services/danielChat.js');

// A fake Microsoft signing key served through a stubbed fetch.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', endorsements: ['msteams'] };
global.fetch = async url => ({ json: async () => (String(url).includes('openidconfiguration') ? { jwks_uri: 'https://keys' } : { keys: [jwk] }) });
const activity = { channelId: 'msteams', serviceUrl: 'https://smba.trafficmanager.net/amer/' };
const sign = (claims, key = privateKey, kid = 'k1') => jwt.sign(claims, key, { algorithm: 'RS256', keyid: kid, expiresIn: '5m' });
const good = { iss: 'https://api.botframework.com', aud: 'bot-app-id-123', serviceurl: activity.serviceUrl };

test('accepts a token Microsoft signed for our bot', async () => {
  const c = await verifyIncoming('Bearer ' + sign(good), activity);
  assert.equal(c.aud, 'bot-app-id-123');
});

test('refuses forged or wrong tokens', async () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verifyIncoming('Bearer ' + sign(good, other), activity));                       // wrong key
  await assert.rejects(verifyIncoming('Bearer ' + sign({ ...good, aud: 'someone-else' }), activity));    // other bot
  await assert.rejects(verifyIncoming('Bearer ' + sign({ ...good, iss: 'https://evil' }), activity));    // other issuer
  await assert.rejects(verifyIncoming('', activity));                                                    // no token
  await assert.rejects(verifyIncoming('Bearer ' + sign(good), { ...activity, serviceUrl: 'https://evil.example.com/' }));
  await assert.rejects(verifyIncoming('Bearer ' + sign(good), { ...activity, channelId: 'webchat' }));   // key not endorsed
});

test('service url allow-list', () => {
  assert.ok(SERVICE_URL_OK.test('https://smba.trafficmanager.net/amer/'));
  assert.ok(!SERVICE_URL_OK.test('https://botframework.com.evil.io/'));
});

test('chat replies: dashes cleaned, drafts checked, reminders kept', () => {
  const o = parseChat('{"reply":"Done — sent to Steven.","draft":{"from":"daniel","to":["steven_filek@comcast.com"],"cc":[],"subject":"Invite","body":"Hi Steven","reply_to":{"mailbox":"kayla","id":"AAMkAGI2THVSAAA="}},"reminders":[{"what":"Call Lisa","due":"2026-10-26"},{"what":"bad","due":"soon"}]}');
  assert.equal(o.reply, 'Done, sent to Steven.');
  assert.deepEqual(o.draft.reply_to, { mailbox: 'kayla', id: 'AAMkAGI2THVSAAA=' });
  assert.deepEqual(o.reminders, [{ what: 'Call Lisa', due: '2026-10-26' }]);
  assert.equal(parseChat('{"reply":"x","draft":{"from":"daniel","to":["jonathan@1cloudcommunications.com"],"subject":"s","body":"b"}}').draft, null);
  assert.equal(parseChat('{"reply":"x","draft":{"from":"daniel","to":["a@b.com"],"subject":"s","body":"b","reply_to":{"mailbox":"nobody","id":"xxxxxxxxxxxx"}}}').draft.reply_to, undefined);
  assert.equal(parseChat('no json'), null);
});

test('draft card has Send and Cancel', () => {
  const card = draftCard({ from: 'daniel', to: ['a@b.com'], cc: [], subject: 'S', body: 'B' }, 7, 'Daniel Reyes');
  assert.deepEqual(card.content.actions.map(a => [a.title, a.data.action, a.data.draftId]), [['Send', 'send', 7], ['Cancel', 'cancel', 7]]);
});
