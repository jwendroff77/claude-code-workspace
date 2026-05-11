// Backfill conversation_id + last_message_id for waiting_partner enrollments
// Then advance to step 3 for contacts where partner has already replied
// Usage: node server/scripts/backfill-thread-ids.js [--advance-jared] [--advance-ed-old]
import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import pool from '../db/connection.js';
import { getLastSentTo } from '../services/graph.js';

const args = process.argv.slice(2);
const ADVANCE_JARED = args.includes('--advance-jared');
const ADVANCE_ED_OLD = args.includes('--advance-ed-old');

async function main() {
  const [enrollments] = await pool.query(
    `SELECT pe.id, pe.prospect_id, pe.sequence_id, pe.agent_id, pe.partner_agent_id,
            pe.conversation_id, pe.last_message_id, pe.enrolled_at,
            p.email AS prospect_email, p.first_name, p.last_name, p.company,
            a.smtp_user AS agent_smtp_user, a.email AS agent_email, a.name AS agent_name,
            pa.name AS partner_name, pa.email AS partner_email
     FROM partner_enrollments pe
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     JOIN agents pa ON pa.id = pe.partner_agent_id
     WHERE pe.status = 'waiting_partner' AND pe.current_step = 2
     ORDER BY pe.enrolled_at ASC`
  );

  console.log(`Found ${enrollments.length} waiting_partner enrollments to process\n`);

  let backfilled = 0, notFound = 0, advanced = 0;

  for (const e of enrollments) {
    const fromEmail = e.agent_smtp_user || e.agent_email;
    const isJared = e.partner_name?.toLowerCase().includes('jared');
    const isEdOld = e.partner_name?.toLowerCase().includes('ed') && !e.enrolled_at?.toString().includes('2026-05-05');

    process.stdout.write(`  ${e.first_name} ${e.last_name} @ ${e.company} [${e.partner_name}] ... `);

    // Try to find sent message and get conversation/message IDs
    let convId = e.conversation_id;
    let msgId = e.last_message_id;

    if (!convId || !msgId) {
      try {
        const sent = await getLastSentTo({ fromEmail, toEmail: e.prospect_email });
        if (sent) {
          convId = sent.conversationId;
          msgId = sent.id;
          await pool.execute(
            `UPDATE partner_enrollments SET conversation_id = ?, last_message_id = ?, updated_at = NOW() WHERE id = ?`,
            [convId, msgId, e.id]
          );
          backfilled++;
          process.stdout.write(`backfilled (conv=${convId?.slice(-8)}) `);
        } else {
          notFound++;
          process.stdout.write(`no sent message found `);
        }
      } catch (err) {
        notFound++;
        process.stdout.write(`Graph error: ${err.message?.slice(0, 60)} `);
      }
    } else {
      process.stdout.write(`already had IDs `);
    }

    // Advance to step 3 if partner has replied
    const shouldAdvance = (ADVANCE_JARED && isJared) || (ADVANCE_ED_OLD && isEdOld);
    if (shouldAdvance) {
      await pool.execute(
        `UPDATE partner_enrollments
         SET current_step = 3, status = 'active', partner_replied_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [e.id]
      );
      advanced++;
      process.stdout.write(`→ ADVANCED to step 3`);
    }

    console.log();
  }

  console.log(`\nDone.`);
  console.log(`  Thread IDs backfilled: ${backfilled}`);
  console.log(`  Not found in sent mail: ${notFound}`);
  console.log(`  Advanced to step 3: ${advanced}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
