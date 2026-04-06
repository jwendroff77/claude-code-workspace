import cron from 'node-cron';
import pool from '../db/connection.js';
import { sendEmail, getTodaySendCount } from './smtp.js';

// Check if current time is within agent's send window
function isInSendWindow(agent) {
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const hours = ct.getHours();
  const minutes = ct.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const [startH, startM] = (agent.send_window_start || '08:00:00').split(':').map(Number);
  const [endH, endM] = (agent.send_window_end || '17:00:00').split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// Check if today is a sending day
function isSendingDay(agent) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = days[new Date().getDay()];
  const sendDays = (agent.send_days || 'Mon-Fri').split('-');

  if (sendDays.length === 2) {
    const startIdx = days.indexOf(sendDays[0]);
    const endIdx = days.indexOf(sendDays[1]);
    const todayIdx = days.indexOf(today);
    return todayIdx >= startIdx && todayIdx <= endIdx;
  }

  return sendDays.includes(today);
}

// Process send queue for a single agent
async function processAgentQueue(agent) {
  if (agent.status !== 'active' || agent.role === 'closer' || agent.role === 'manual') return;
  if (!isSendingDay(agent)) return;
  if (!isInSendWindow(agent)) return;

  const sentToday = await getTodaySendCount(agent.id);
  if (sentToday >= agent.daily_send_limit) return;

  const remaining = agent.daily_send_limit - sentToday;

  // Get enrolled prospects due for their next step
  const [enrollments] = await pool.execute(
    `SELECT pse.id, pse.prospect_id, pse.sequence_id, pse.current_step,
            p.email, p.first_name, p.last_name, p.company
     FROM prospect_sequence_enrollment pse
     JOIN prospects p ON p.id = pse.prospect_id
     WHERE pse.agent_id = ? AND pse.status = 'active'
     AND DATE_ADD(pse.enrolled_at, INTERVAL (
       SELECT COALESCE(SUM(ss2.delay_days), 0)
       FROM sequence_steps ss2
       WHERE ss2.sequence_id = pse.sequence_id AND ss2.step_number <= pse.current_step
     ) DAY) <= NOW()
     LIMIT ?`,
    [agent.id, remaining]
  );

  for (const enrollment of enrollments) {
    // Get the current step content
    const [steps] = await pool.execute(
      `SELECT * FROM sequence_steps
       WHERE sequence_id = ? AND step_number = ?`,
      [enrollment.sequence_id, enrollment.current_step]
    );

    if (steps.length === 0) {
      // Sequence completed
      await pool.execute(
        `UPDATE prospect_sequence_enrollment SET status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        [enrollment.id]
      );
      continue;
    }

    const step = steps[0];

    // Personalize content
    const subject = personalizeContent(step.subject_line, enrollment);
    const body = personalizeContent(step.body_html || step.body_text, enrollment);

    try {
      await sendEmail({
        agent,
        to: enrollment.email,
        subject,
        html: body,
        text: step.body_text ? personalizeContent(step.body_text, enrollment) : undefined,
        prospectId: enrollment.prospect_id,
        stepId: step.id,
      });

      // Advance to next step
      await pool.execute(
        'UPDATE prospect_sequence_enrollment SET current_step = current_step + 1 WHERE id = ?',
        [enrollment.id]
      );
    } catch (err) {
      console.error(`Send failed for ${enrollment.email}:`, err.message);
    }
  }
}

function personalizeContent(content, prospect) {
  if (!content) return '';
  return content
    .replace(/\{\{firstName\}\}/g, prospect.first_name || '')
    .replace(/\{\{lastName\}\}/g, prospect.last_name || '')
    .replace(/\{\{company\}\}/g, prospect.company || '')
    .replace(/\{\{email\}\}/g, prospect.email || '');
}

// Main scheduler — runs every 10 minutes during business hours
export function startScheduler() {
  // Send queue processor — every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Scheduler] Processing send queues...');
    try {
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE role = 'outbound' AND status = 'active'"
      );

      for (const agent of agents) {
        await processAgentQueue(agent);
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  // IMAP poll — every 5 minutes (imported dynamically to avoid circular deps)
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Scheduler] Polling inboxes...');
    try {
      const { checkNewEmails } = await import('./imap.js');
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE status = 'active'"
      );

      for (const agent of agents) {
        const newEmails = await checkNewEmails(agent);
        if (newEmails.length > 0) {
          console.log(`[IMAP] ${agent.name}: ${newEmails.length} new emails`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] IMAP error:', err.message);
    }
  });

  // Auto-pull check — every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Checking agent queues for auto-pull...');
    try {
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE role = 'outbound' AND status = 'active'"
      );

      for (const agent of agents) {
        const [queueCount] = await pool.execute(
          `SELECT COUNT(*) as count FROM prospects
           WHERE assigned_agent_id = ? AND status = 'in_sequence'`,
          [agent.id]
        );

        if (queueCount[0].count < agent.queue_threshold) {
          console.log(`[AutoPull] ${agent.name} queue low (${queueCount[0].count}/${agent.queue_threshold})`);
          // TODO: Trigger Apollo auto-pull when API key configured
        }
      }
    } catch (err) {
      console.error('[Scheduler] Auto-pull error:', err.message);
    }
  });

  console.log('[Scheduler] Started — send queue (10min), IMAP poll (5min), auto-pull check (1hr)');
}
