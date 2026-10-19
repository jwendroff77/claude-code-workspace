// Dry run: which enrollment each agent's partner cadence would send next, under the
// OLD pick (each agent's top row only, skipped if not due) and the NEW pick (first
// due row per agent, see services/partnerCadenceDue.js).  READ-ONLY: runs inside a
// READ ONLY transaction, sends nothing, writes nothing.
//
// Usage (from the repo root):
//   MYSQL_URL=mysql://user:pass@host:port/db node server/scripts/partner-cadence-dryrun.js [--live-gap]
//
// The SQL below mirrors processPartnerCadences in services/scheduler.js.  By default
// it leaves out the 110s per-agent gap so an agent that just sent still shows its
// next pick; --live-gap puts it back.  It does not check the send window.
import mysql from 'mysql2/promise';
import { countBusinessDays, pickFirstDuePerAgent } from '../services/partnerCadenceDue.js';

const url = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
if (!url) { console.error('Set MYSQL_URL'); process.exit(1); }
const liveGap = process.argv.includes('--live-gap');

const gapSec = 110;
const DAILY_CAP = 125;
const ctNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
const minsSinceCtMidnight = ctNow.getHours() * 60 + ctNow.getMinutes();

function candidatesSql({ newLogic }) {
  return `SELECT * FROM (
     SELECT pe.id, pe.agent_id, pe.sequence_id, pe.current_step, pe.status,
            pe.partner_replied_at, pe.enrolled_at,
            p.email AS prospect_email, p.company, a.name AS agent_name,
            pss_cur.step_type AS cur_step_type, pss_cur.delay_days AS cur_delay_days,
            ROW_NUMBER() OVER (
              PARTITION BY pe.agent_id
              ORDER BY pe.partner_replied_at ASC, pe.current_step DESC, pe.enrolled_at ASC
            ) AS agent_rn
   FROM partner_enrollments pe
   JOIN prospects p ON p.id = pe.prospect_id
   JOIN agents a ON a.id = pe.agent_id
   JOIN agents pa ON pa.id = pe.partner_agent_id
   JOIN partner_sequences ps ON ps.id = pe.sequence_id
   JOIN partner_sequence_steps pss_cur ON pss_cur.sequence_id = pe.sequence_id
                                      AND pss_cur.step_number = pe.current_step
                                      AND pss_cur.step_type IN ('agent_send_cc', 'agent_followup')
   WHERE pe.status IN ('active', 'waiting_partner')
   AND ps.status = 'active'
   ${newLogic ? `AND (pss_cur.step_type <> 'agent_followup'
        OR DATEDIFF(NOW(), pe.partner_replied_at) + 1 >= pss_cur.delay_days)` : ''}
   AND (SELECT COUNT(*) FROM sent_emails se_cap
        WHERE se_cap.agent_id = pe.agent_id
          AND se_cap.sent_at >= NOW() - INTERVAL ${minsSinceCtMidnight} MINUTE) < ${DAILY_CAP}
   AND p.status NOT IN ('disqualified', 'unsubscribed', 'bounced', 'booked', 'handed_off', 'won', 'engaged')
   ${liveGap ? `AND NOT EXISTS (
     SELECT 1 FROM sent_emails se_gap
     WHERE se_gap.agent_id = pe.agent_id
       AND se_gap.sent_at > NOW() - INTERVAL ${gapSec} SECOND
   )` : ''}
   AND NOT EXISTS (
     SELECT 1 FROM sent_emails se
     WHERE se.prospect_id = pe.prospect_id
       AND se.agent_id = pe.agent_id
       AND se.sent_at >= NOW() - INTERVAL ${minsSinceCtMidnight} MINUTE
   )
   AND NOT (pss_cur.step_type = 'agent_followup' AND pe.partner_replied_at IS NULL)
   ) ranked
   WHERE agent_rn <= ${newLogic ? 200 : 1}
   ORDER BY partner_replied_at ASC, current_step DESC, enrolled_at ASC, agent_rn ASC`;
}

// The old in-loop due check, as it ran on the single top row
function oldIsDue(row, now) {
  if (row.cur_step_type === 'agent_send_cc') {
    const dueAt = new Date(row.enrolled_at);
    dueAt.setDate(dueAt.getDate() + Number(row.cur_delay_days || 0));
    return dueAt <= now;
  }
  if (!row.partner_replied_at) return false;
  return countBusinessDays(new Date(row.partner_replied_at), now) >= row.cur_delay_days;
}

function describe(row, now) {
  const biz = row.partner_replied_at ? countBusinessDays(new Date(row.partner_replied_at), now) : '-';
  return `#${row.id} seq ${row.sequence_id} step ${row.current_step} (${row.cur_step_type}, delay ${row.cur_delay_days}, biz days ${biz}) ${row.prospect_email} / ${row.company || ''}`;
}

const conn = await mysql.createConnection(url);
try {
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION READ ONLY');
  const now = new Date();
  const [[clock]] = await conn.query('SELECT NOW() AS db_now');
  console.log(`App clock ${now.toISOString()}  |  DB clock ${new Date(clock.db_now).toISOString()}  |  per-agent gap ${liveGap ? 'ON' : 'ignored'}\n`);

  const [oldRows] = await conn.query(candidatesSql({ newLogic: false }));
  const [newRows] = await conn.query(candidatesSql({ newLogic: true }));
  const newPicks = new Map(pickFirstDuePerAgent(newRows, now).map(r => [r.agent_id, r]));

  const agents = new Map();
  for (const r of [...oldRows, ...newRows]) agents.set(r.agent_id, r.agent_name);

  for (const [agentId, name] of [...agents].sort((a, b) => a[0] - b[0])) {
    const top = oldRows.find(r => r.agent_id === agentId);
    const mine = newRows.filter(r => r.agent_id === agentId);
    const dueCount = mine.filter(r => pickFirstDuePerAgent([r], now).length).length;
    console.log(`Agent ${agentId} ${name}`);
    if (!top) console.log('  OLD: nothing selected');
    else if (oldIsDue(top, now)) console.log(`  OLD: sends ${describe(top, now)}`);
    else console.log(`  OLD: BLOCKED, top row not due: ${describe(top, now)}`);
    const pick = newPicks.get(agentId);
    console.log(pick ? `  NEW: sends ${describe(pick, now)}` : '  NEW: nothing due');
    console.log(`       (${mine.length} rows past the SQL prefilter, ${dueCount} due now)\n`);
  }
  await conn.query('ROLLBACK');
} finally {
  await conn.end();
}
