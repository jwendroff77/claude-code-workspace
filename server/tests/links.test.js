// Run: node --test server/tests/links.test.js
// Unsubscribe and Approve/Skip links must keep working through a secret rotation.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { signLink, verifyLink, linkSecrets } from '../services/linkSecret.js';

const oldStyle = (secret, data, len) => crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, len);
function withEnv(vars, fn) {
  const saved = {};
  for (const k of ['LINK_SECRET', 'LINK_SECRET_OLD', 'JWT_SECRET']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('no change until LINK_SECRET is set: same signatures as before', () => withEnv({ JWT_SECRET: 'onecloud2026' }, () => {
  assert.equal(signLink('42:a@b.com', 16), oldStyle('onecloud2026', '42:a@b.com', 16));
  assert.equal(signLink('replacement:4', 24), oldStyle('onecloud2026', 'replacement:4', 24));
}));

test('after rotation: new links use the new secret, links already emailed still work', () => withEnv({ JWT_SECRET: 'new-admin-secret-xyz', LINK_SECRET: 'brand-new-link-secret', LINK_SECRET_OLD: 'onecloud2026' }, () => {
  const emailedLastWeek = oldStyle('onecloud2026', '42:a@b.com', 16);
  assert.equal(verifyLink('42:a@b.com', emailedLastWeek, 16), true);
  const fresh = signLink('42:a@b.com', 16);
  assert.equal(fresh, oldStyle('brand-new-link-secret', '42:a@b.com', 16));
  assert.equal(verifyLink('42:a@b.com', fresh, 16), true);
  assert.deepEqual(linkSecrets(), ['brand-new-link-secret', 'onecloud2026']);
}));

test('forged, altered or wrong-length links fail', () => withEnv({ LINK_SECRET: 'brand-new-link-secret' }, () => {
  assert.equal(verifyLink('42:a@b.com', oldStyle('guess', '42:a@b.com', 16), 16), false);
  assert.equal(verifyLink('43:a@b.com', signLink('42:a@b.com', 16), 16), false);
  assert.equal(verifyLink('42:a@b.com', 'short', 16), false);
  assert.equal(verifyLink('42:a@b.com', undefined, 16), false);
  // once the old secret is dropped, old links stop working (by design, after ~60 days)
  assert.equal(verifyLink('42:a@b.com', oldStyle('onecloud2026', '42:a@b.com', 16), 16), false);
}));
