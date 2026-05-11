// Send remaining Jared Step 3 emails, 15 min apart, NO BCC to Jonathan
// Uses existing graph.replyToMessage (which doesn't BCC anyone)
import 'dotenv/config';
import pool from '../db/connection.js';
import { replyToMessage, getLastSentTo } from '../services/graph.js';

const FROM_EMAIL = 'mbarrett@1cloudnow.com';
const INTERVAL_MS = 15 * 60 * 1000; // 15 min
const START_DELAY_MS = 30 * 1000; // wait 30s so we don't collide with first-run

function personalize(template, { firstName, company }) {
  let out = template;
  out = out.replace(/\{\{firstName\}\}/g, firstName || 'there');
  out = out.replace(/\{\{company\}\}/g, company || 'your team');
  // safety: strip any remaining merge tags
  out = out.replace(/\{\{[^}]+\}\}/g, '');
  return out;
}

async function main() {
  console.log(`[Step3Batch] Starting at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`);

  const [steps] = await pool.query(
    `SELECT body_html FROM partner_sequence_steps WHERE sequence_id = 1 AND step_number = 3`
  );
  if (!steps.length) throw new Error('No Step 3 template');
  const template = steps[0].body_html;

  const [rows] = await pool.query(`
    SELECT pe.id AS enrollment_id, pe.prospect_id, pe.last_message_id, pe.agent_id,
           p.first_name, p.last_name, p.email, p.company
    FROM partner_enrollments pe
    JOIN prospects p ON p.id = pe.prospect_id
    WHERE pe.sequence_id = 1
      AND pe.current_step = 3
      AND pe.status = 'active'
      AND pe.last_message_id IS NOT NULL
    ORDER BY pe.id
  `);

  console.log(`[Step3Batch] Queue: ${rows.length} emails, ${INTERVAL_MS/60000} min apart`);
  console.log(`[Step3Batch] Estimated completion: ${new Date(Date.now() + rows.length * INTERVAL_MS).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`);

  await new Promise(r => setTimeout(r, START_DELAY_MS));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const body = personalize(template, { firstName: r.first_name, company: r.company });
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

    try {
      await replyToMessage({
        fromEmail: FROM_EMAIL,
        messageId: r.last_message_id,
        html: body,
      });
      console.log(`[${i+1}/${rows.length}] ${now} CT -> ${r.first_name} ${r.last_name} <${r.email}> SENT`);

      // log sent_email
      await pool.execute(
        `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [r.prospect_id, r.agent_id, 'Partner cadence Step 3', body]
      );

      // advance enrollment to step 4 FIRST (so scheduler can't resend if the refresh fails)
      await pool.execute(
        `UPDATE partner_enrollments
         SET current_step = 4, updated_at = NOW()
         WHERE id = ?`,
        [r.enrollment_id]
      );

      // Best-effort: refresh last_message_id for future threading; failures here are non-fatal
      await new Promise(s => setTimeout(s, 6000));
      try {
        const lastSent = await getLastSentTo({ fromEmail: FROM_EMAIL, toEmail: r.email });
        if (lastSent?.id) {
          await pool.execute(
            `UPDATE partner_enrollments SET last_message_id = ? WHERE id = ?`,
            [lastSent.id, r.enrollment_id]
          );
        }
      } catch (mseErr) {
        console.log(`  [msg-id refresh failed for ${r.email}: ${mseErr.message}]`);
      }
    } catch (err) {
      console.error(`[${i+1}/${rows.length}] ${now} CT -> ${r.email} FAILED:`, err.message);
    }

    if (i < rows.length - 1) {
      await new Promise(s => setTimeout(s, INTERVAL_MS));
    }
  }

  console.log(`[Step3Batch] Done at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`);
  process.exit(0);
}

main().catch(e => {
  console.error('[Step3Batch] Fatal:', e);
  process.exit(1);
});
