// Flush overdue partner cadence follow-ups directly (no HTTP timeout issues)
// Usage: node server/scripts/flush-partner-followups.js <partner_agent_id>
// Example: node server/scripts/flush-partner-followups.js 6   (Jared)
//          node server/scripts/flush-partner-followups.js 7   (Ed)
import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import pool from '../db/connection.js';
import { replyToMessage, getLastSentTo, sendMail } from '../services/graph.js';

const partner_agent_id = parseInt(process.argv[2]);
if (!partner_agent_id) { console.error('Usage: node flush-partner-followups.js <partner_agent_id>'); process.exit(1); }

function randomDelay() {
  return (Math.random() * 60 + 180) * 1000; // 180-240s (3-4 min)
}

async function main() {
  const [enrollments] = await pool.query(
    `SELECT pe.*, p.email AS prospect_email, p.first_name, p.last_name, p.company,
            p.industry, p.city, p.state, p.title AS prospect_title,
            a.name AS agent_name, a.smtp_user AS agent_smtp_user, a.email AS agent_email,
            pa.name AS partner_name, pa.email AS partner_email,
            pss.body_html AS step_body, pss.subject_line AS step_subject, pss.delay_days
     FROM partner_enrollments pe
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     JOIN agents pa ON pa.id = pe.partner_agent_id
     JOIN partner_sequences ps ON ps.id = pe.sequence_id
     JOIN partner_sequence_steps pss ON pss.sequence_id = pe.sequence_id AND pss.step_number = pe.current_step
     WHERE pe.partner_agent_id = ?
       AND pe.status = 'active'
       AND pss.step_type = 'agent_followup'
       AND pe.partner_replied_at IS NOT NULL
       AND TIMESTAMPDIFF(DAY, pe.partner_replied_at, NOW()) >= pss.delay_days
     ORDER BY pe.partner_replied_at ASC`,
    [partner_agent_id]
  );

  if (!enrollments.length) {
    console.log('No overdue follow-ups found.');
    await pool.end();
    return;
  }

  console.log(`[FlushFollowups] ${enrollments.length} overdue follow-ups to send for partner_agent_id=${partner_agent_id}`);
  console.log(`[FlushFollowups] Estimated time: ~${Math.round(enrollments.length * 3.5)} min\n`);

  let sent = 0, failed = 0;

  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    const fromEmail = e.agent_smtp_user || e.agent_email;

    const body = (e.step_body || '')
      .replace(/\{\{firstName\}\}/g, e.first_name || '')
      .replace(/\{\{lastName\}\}/g, e.last_name || '')
      .replace(/\{\{company\}\}/g, e.company || '')
      .replace(/\{\{[^}]+\}\}/g, '');

    try {
      let sendMethod = 'standalone';
      if (e.last_message_id) {
        try {
          await replyToMessage({ fromEmail, messageId: e.last_message_id, html: body });
          sendMethod = 'in-thread';
        } catch (replyErr) {
          const subject = `Re: ${e.partner_name} intro - ${e.company}`;
          await sendMail({ fromEmail, to: e.prospect_email, cc: e.partner_email, subject, html: body });
        }
      } else {
        const subject = `Re: ${e.partner_name} intro - ${e.company}`;
        await sendMail({ fromEmail, to: e.prospect_email, cc: e.partner_email, subject, html: body });
      }

      await pool.execute(
        `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at) VALUES (?, ?, ?, ?, NOW())`,
        [e.prospect_id, e.agent_id, `Partner cadence Step ${e.current_step}`, body]
      );

      // Capture new message ID for thread continuity
      await new Promise(r => setTimeout(r, 6000));
      let lastSentId = e.last_message_id;
      try {
        const lastSent = await getLastSentTo({ fromEmail, toEmail: e.prospect_email });
        if (lastSent?.id) lastSentId = lastSent.id;
      } catch {}

      await pool.execute(
        `UPDATE partner_enrollments SET current_step = ?, last_message_id = ?, updated_at = NOW() WHERE id = ?`,
        [e.current_step + 1, lastSentId, e.id]
      );

      sent++;
      console.log(`[${sent}/${enrollments.length}] ${e.first_name} ${e.last_name} @ ${e.company} [${sendMethod}]`);

      if (i < enrollments.length - 1) {
        const delay = randomDelay();
        console.log(`  Waiting ${Math.round(delay/1000)}s before next send...\n`);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${e.first_name} ${e.last_name} @ ${e.company} — ${err.message}`);
    }
  }

  console.log(`\n[FlushFollowups] Done. Sent: ${sent}, Failed: ${failed}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
