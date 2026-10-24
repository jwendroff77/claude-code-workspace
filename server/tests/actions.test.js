// Run: node --test server/tests/actions.test.js   (fake database, nothing real is touched)
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeOrRun, approveAction, cancelAction, autonomy, setAutonomy } from '../services/danielActions.js';

// A tiny fake of mysql2's pool.execute that records SQL and answers the few SELECTs the actions make.
function fakeDb(data = {}) {
  const log = []; let nextId = 100; const actions = {}; let settings = data.settings || null;
  return {
    log,
    async execute(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      log.push(s);
      if (/^CREATE TABLE/i.test(s)) return [{}];
      if (/SELECT setting_value FROM settings/.test(s)) return [settings ? [{ setting_value: settings }] : []];
      if (/SELECT id FROM settings/.test(s)) return [settings ? [{ id: 1 }] : []];
      if (/^(UPDATE|INSERT INTO) settings/.test(s)) { settings = args[0]; return [{ affectedRows: 1 }]; }
      if (/INSERT INTO daniel_actions/.test(s)) { const id = nextId++; actions[id] = { id, action: args[0], params_json: args[1], summary: args[2], status: 'pending' }; return [{ insertId: id }]; }
      if (/UPDATE daniel_actions SET status='running'/.test(s)) { const a = actions[args[0]]; if (a && a.status === 'pending') { a.status = 'running'; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
      if (/UPDATE daniel_actions SET status='cancelled'/.test(s)) { const a = actions[args[0]]; if (a && a.status === 'pending') { a.status = 'cancelled'; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
      if (/UPDATE daniel_actions SET status='(done|failed)'/.test(s)) { actions[args[1]].status = s.includes("'done'") ? 'done' : 'failed'; actions[args[1]].result = args[0]; return [{ affectedRows: 1 }]; }
      if (/SELECT \* FROM daniel_actions/.test(s)) return [[actions[args[0]]]];
      if (/SELECT status, result FROM daniel_actions/.test(s)) return [[actions[args[0]]]];
      if (/FROM prospects WHERE id=/.test(s)) return [[data.prospects?.[args[0]]].filter(Boolean)];
      if (/SELECT id FROM exclusion_list/.test(s)) return [[]];
      if (/SELECT id FROM prospects WHERE LOWER\(email\)/.test(s)) return [data.dupes || []];
      if (/FROM partner_enrollments WHERE prospect_id=\? ORDER BY id DESC/.test(s)) return [[data.enrollment].filter(Boolean)];
      if (/FROM replacement_approvals ra/.test(s)) return [[data.approval].filter(Boolean)];
      if (/FROM agents WHERE id=/.test(s)) return [[{ id: args[0], name: 'Kate Harmon', status: 'active' }]];
      if (/^INSERT/i.test(s)) return [{ insertId: nextId++, affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    },
  };
}
const P = { 7: { id: 7, first_name: 'Brandon', last_name: 'Perry', email: 'bperry@mphshc.org', company: 'Memphis Health Center', status: 'in_sequence' } };

test('defaults: what the prospect asked for runs, judgment calls ask', async () => {
  const m = await autonomy(fakeDb());
  assert.equal(m.stop_cadence, 'auto');
  assert.equal(m.mark_booked, 'auto');
  assert.equal(m.switch_contact, 'ask');
  assert.equal(m.approve_replacement, 'ask');
  assert.equal(m.resume_rep, 'ask');
});

test('auto action runs right away and stops both cadence tracks', async () => {
  const db = fakeDb({ prospects: P }); const ctx = {};
  const out = await proposeOrRun({ action: 'stop_cadence', params: { prospect_id: 7, why: 'not_now' }, summary: 'Stop Brandon' }, ctx, db);
  assert.match(out, /^Done: Stopped all emails to Brandon Perry at Memphis Health Center, marked Engaged/);
  assert.ok(db.log.some(s => /UPDATE prospect_sequence_enrollment SET status='cancelled'/.test(s)));
  assert.ok(db.log.some(s => /UPDATE partner_enrollments SET status='cancelled'/.test(s)));
  assert.ok(!db.log.some(s => /INSERT INTO exclusion_list/.test(s)), 'not_now must not block future outreach');
  assert.equal(ctx.actions[0].status, 'done');
});

test('unsubscribe adds them to the do-not-email list', async () => {
  const db = fakeDb({ prospects: P });
  await proposeOrRun({ action: 'stop_cadence', params: { prospect_id: 7, why: 'unsubscribe' }, summary: 'x' }, {}, db);
  assert.ok(db.log.some(s => /INSERT INTO exclusion_list/.test(s)));
});

test('ask action waits, runs only on approve, and only once', async () => {
  const db = fakeDb({ approval: { id: 4, status: 'pending', new_prospect_id: 9, enrollment_id: 3, first_name: 'Scott', last_name: 'Hernandez', company: 'Provident Title' } });
  const out = await proposeOrRun({ action: 'approve_replacement', params: { approval_id: 4 }, summary: 'Switch Provident Title to Scott Hernandez' }, {}, db);
  assert.match(out, /Waiting for Jonathan's OK \(action #100\)/);
  assert.ok(!db.log.some(s => /UPDATE replacement_approvals/.test(s)), 'nothing changed before approval');
  assert.match(await approveAction(100, db), /Approved: Scott Hernandez at Provident Title/);
  assert.ok(db.log.some(s => /UPDATE partner_enrollments SET status='active'/.test(s)));
  assert.match(await approveAction(100, db), /already done/);
});

test('cancel leaves everything alone', async () => {
  const db = fakeDb({});
  await proposeOrRun({ action: 'resume_rep', params: { agent_id: 4 }, summary: 'Resume Kate' }, {}, db);
  assert.match(await cancelAction(100, db), /Cancelled/);
  assert.ok(!db.log.some(s => /UPDATE agents/.test(s)));
});

test('switch_contact refuses another company, shared mailboxes and duplicates', async () => {
  const base = { prospects: { 5: { id: 5, first_name: 'David', last_name: 'Cox', email: 'dcox@swshipyard.com', company: 'Southwest Shipyard', status: 'disqualified' } }, enrollment: { id: 1, sequence_id: 8, agent_id: 9, partner_agent_id: 10 }, settings: JSON.stringify({ switch_contact: 'auto' }) };
  let out = await proposeOrRun({ action: 'switch_contact', params: { prospect_id: 5, first_name: 'Cesar', last_name: 'Perez', email: 'cesar@gmail.com' }, summary: 'x' }, {}, fakeDb(base));
  assert.match(out, /^Failed: .*not at Southwest Shipyard's domain/);
  out = await proposeOrRun({ action: 'switch_contact', params: { prospect_id: 5, email: 'info@swshipyard.com' }, summary: 'x' }, {}, fakeDb(base));
  assert.match(out, /shared mailbox/);
  out = await proposeOrRun({ action: 'switch_contact', params: { prospect_id: 5, email: 'cesar.perez@swshipyard.com' }, summary: 'x' }, {}, fakeDb({ ...base, dupes: [{ id: 1 }] }));
  assert.match(out, /already in the platform/);
  const db = fakeDb(base);
  out = await proposeOrRun({ action: 'switch_contact', params: { prospect_id: 5, first_name: 'Cesar', last_name: 'Perez', email: 'cesar.perez@swshipyard.com', title: 'Operations' }, summary: 'x' }, {}, db);
  assert.match(out, /^Done: Switched Southwest Shipyard from David Cox to Cesar Perez/);
  assert.ok(db.log.some(s => /INSERT INTO partner_enrollments .* 'active', 1/.test(s)));
});

test('autonomy can be changed and is remembered', async () => {
  const db = fakeDb();
  assert.match(await setAutonomy('switch_contact', 'auto', db), /just does it/);
  assert.equal((await autonomy(db)).switch_contact, 'auto');
  assert.match(await setAutonomy('nonsense', 'auto', db), /Unknown/);
});
