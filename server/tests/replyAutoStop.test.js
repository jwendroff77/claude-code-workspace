// Run: node --test server/tests/replyAutoStop.test.js   (fake database, nothing real is touched)
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoStopOnReply } from '../services/replyAutoStop.js';

function fakeDb({ status = 'in_sequence', excluded = false, live = 1 } = {}) {
  const log = [];
  return {
    log,
    async execute(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      log.push(s);
      if (/FROM prospects WHERE id=/.test(s)) return [[{ id: args[0], email: 'pat@acme.com', company: 'Acme', status }]];
      if (/SELECT id FROM exclusion_list/.test(s)) return [excluded ? [{ id: 1 }] : []];
      if (/^UPDATE partner_enrollments/.test(s)) return [{ affectedRows: live }];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}
const has = (db, re) => db.log.some(s => re.test(s));

test('a no: cadence stopped, Unsubscribed, Do Not Contact, reply marked handled', async () => {
  const db = fakeDb();
  const r = await autoStopOnReply(db, { prospectId: 5, agentId: 9, receivedEmailId: 77, sentiment: 'negative' });
  assert.match(r, /unsubscribed/);
  assert.ok(has(db, /UPDATE partner_enrollments SET status='cancelled'/));
  assert.ok(has(db, /UPDATE prospect_sequence_enrollment SET status='cancelled'/));
  assert.ok(has(db, /SET status='unsubscribed'/));
  assert.ok(has(db, /INSERT INTO exclusion_list/));
  assert.ok(has(db, /action_type='auto_unsubscribe'/));
});

test('a no from someone already on Do Not Contact is not added twice', async () => {
  const db = fakeDb({ excluded: true });
  await autoStopOnReply(db, { prospectId: 5, sentiment: 'negative' });
  assert.ok(!has(db, /INSERT INTO exclusion_list/));
});

for (const sentiment of ['not_now', 'positive', 'meeting_request']) {
  test(`${sentiment}: cadence stopped, Engaged, never Do Not Contact`, async () => {
    const db = fakeDb();
    const r = await autoStopOnReply(db, { prospectId: 5, receivedEmailId: 77, sentiment });
    assert.match(r, /Engaged/);
    assert.ok(has(db, /UPDATE partner_enrollments SET status='cancelled'/));
    assert.ok(has(db, /SET status='engaged'/));
    assert.ok(!has(db, /exclusion_list/));
    // positive / meeting replies still need a person, so they stay in the inbox queue
    assert.equal(has(db, /actioned=1/), sentiment === 'not_now');
  });
}

for (const sentiment of ['ooo', 'question', 'referral', 'neutral']) {
  test(`${sentiment}: left alone`, async () => {
    const db = fakeDb();
    assert.equal(await autoStopOnReply(db, { prospectId: 5, sentiment }), null);
    assert.equal(db.log.length, 0);
  });
}

for (const status of ['booked', 'won', 'handed_off']) {
  test(`${status} prospects are never touched, even on a no`, async () => {
    const db = fakeDb({ status });
    assert.equal(await autoStopOnReply(db, { prospectId: 5, sentiment: 'negative' }), null);
    assert.ok(!db.log.some(s => /^(UPDATE|INSERT)/.test(s)));
  });
}

test('a "no" inside a live conversation (Engaged) does not unsubscribe them', async () => {
  const db = fakeDb({ status: 'engaged' });
  assert.equal(await autoStopOnReply(db, { prospectId: 5, sentiment: 'negative' }), null);
  assert.ok(!db.log.some(s => /^(UPDATE|INSERT)/.test(s)));
});

test('already unsubscribed: only leftover enrollments are cleared', async () => {
  const db = fakeDb({ status: 'unsubscribed' });
  const r = await autoStopOnReply(db, { prospectId: 5, sentiment: 'negative' });
  assert.match(r, /leftover/);
  assert.ok(!has(db, /UPDATE prospects/));
  assert.ok(!has(db, /exclusion_list/));
});

test('no prospect, nothing happens', async () => {
  const db = fakeDb();
  assert.equal(await autoStopOnReply(db, { prospectId: null, sentiment: 'negative' }), null);
  assert.equal(db.log.length, 0);
});
