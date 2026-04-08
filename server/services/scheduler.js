import cron from 'node-cron';
import pool from '../db/connection.js';
import { sendEmail, getTodaySendCount } from './smtp.js';
import { sendMail, getInboxByConversation, getLastSentTo, replyToMessage } from './graph.js';

// Random delay between min and max milliseconds
function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Get minutes remaining in send window
function minutesLeftInWindow(agent) {
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const currentMinutes = ct.getHours() * 60 + ct.getMinutes();

  const [endH, endM] = (agent.send_window_end || '17:00:00').split(':').map(Number);
  const endMinutes = endH * 60 + endM;

  return Math.max(0, endMinutes - currentMinutes);
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

// Process send queue for a single agent — sends ONE email per tick
async function processAgentQueue(agent) {
  if (agent.status !== 'active' || agent.role === 'closer' || agent.role === 'manual') return 0;
  if (!isSendingDay(agent)) return 0;
  if (!isInSendWindow(agent)) return 0;

  const sentToday = await getTodaySendCount(agent.id);
  if (sentToday >= agent.daily_send_limit) return 0;

  const remaining = agent.daily_send_limit - sentToday;
  const minsLeft = minutesLeftInWindow(agent);

  // Calculate ideal gap between emails for this agent
  // Example: 40 emails over 540 minutes = 1 email every 13.5 minutes
  const idealGapMinutes = minsLeft / Math.max(remaining, 1);

  // Only send if enough time has passed since last send
  // Check last sent timestamp for this agent
  const [lastSendRows] = await pool.execute(
    `SELECT sent_at FROM sent_emails WHERE agent_id = ? AND DATE(sent_at) = CURDATE()
     ORDER BY sent_at DESC LIMIT 1`,
    [agent.id]
  );

  if (lastSendRows.length > 0) {
    const lastSentAt = new Date(lastSendRows[0].sent_at);
    const minutesSinceLast = (Date.now() - lastSentAt.getTime()) / 60000;
    // Add some randomness: require at least 70-130% of the ideal gap
    const jitter = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3
    const requiredGap = idealGapMinutes * jitter;

    if (minutesSinceLast < requiredGap) {
      return 0; // Not enough time has passed — skip this tick
    }
  }

  // Only send 1 email per tick per agent — true drip
  const maxThisTick = 1;

  // Get enrolled prospects due for their next step
  const [enrollments] = await pool.query(
    `SELECT pse.id, pse.prospect_id, pse.sequence_id, pse.current_step,
            p.email, p.first_name, p.last_name, p.company
     FROM prospect_sequence_enrollment pse
     JOIN prospects p ON p.id = pse.prospect_id
     WHERE pse.agent_id = ${pool.escape(agent.id)} AND pse.status = 'active'
     AND DATE_ADD(pse.enrolled_at, INTERVAL (
       SELECT COALESCE(SUM(ss2.delay_days), 0)
       FROM sequence_steps ss2
       WHERE ss2.sequence_id = pse.sequence_id AND ss2.step_number <= pse.current_step
     ) DAY) <= NOW()
     LIMIT ${parseInt(maxThisTick)}`
  );

  let sentCount = 0;

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
      // Random delay between emails: 45-120 seconds
      if (sentCount > 0) {
        const delaySec = Math.floor(Math.random() * 76) + 45;
        console.log(`[Scheduler] ${agent.name}: waiting ${delaySec}s before next send...`);
        await randomDelay(delaySec * 1000, delaySec * 1000);
      }

      await sendEmail({
        agent,
        to: enrollment.email,
        subject,
        html: body,
        text: step.body_text ? personalizeContent(step.body_text, enrollment) : undefined,
        prospectId: enrollment.prospect_id,
        stepId: step.id,
      });

      console.log(`[Scheduler] ${agent.name} -> ${enrollment.email} (step ${enrollment.current_step})`);

      // Advance to next step
      await pool.execute(
        'UPDATE prospect_sequence_enrollment SET current_step = current_step + 1 WHERE id = ?',
        [enrollment.id]
      );

      sentCount++;
    } catch (err) {
      console.error(`Send failed for ${enrollment.email}:`, err.message);
    }
  }

  return sentCount;
}

function personalizeContent(content, prospect) {
  if (!content) return '';
  return content
    .replace(/\{\{firstName\}\}/g, prospect.first_name || '')
    .replace(/\{\{lastName\}\}/g, prospect.last_name || '')
    .replace(/\{\{company\}\}/g, prospect.company || '')
    .replace(/\{\{email\}\}/g, prospect.email || '');
}

// Main scheduler
export function startScheduler() {
  // Send queue processor — every 3 minutes (sends 1-3 emails per agent per tick)
  // With 30 daily limit and 9hr window (8am-5pm = 540min / 3min = 180 ticks)
  // That spreads 30 emails across 180 ticks = ~1 every 6 ticks = ~1 every 18 min per agent
  // Each agent is offset by a random delay so they don't all fire at the same second
  cron.schedule('*/3 * * * *', async () => {
    try {
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE role = 'outbound' AND status = 'active'"
      );

      // Shuffle agent order each tick so they don't always send in the same sequence
      const shuffled = agents.sort(() => Math.random() - 0.5);

      for (const agent of shuffled) {
        // Random offset per agent: 0-90 seconds so agents don't all send at :00
        const offsetSec = Math.floor(Math.random() * 91);
        await randomDelay(offsetSec * 1000, offsetSec * 1000);

        const sent = await processAgentQueue(agent);
        if (sent > 0) {
          console.log(`[Scheduler] ${agent.name}: sent ${sent} email(s) this tick`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  // IMAP poll — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
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
        }
      }
    } catch (err) {
      console.error('[Scheduler] Auto-pull error:', err.message);
    }
  });

  // =====================================================
  // PARTNER CADENCE SCHEDULER — separate from direct SDR
  // Processes partner_enrollments table only
  // =====================================================
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processPartnerCadences();
    } catch (err) {
      console.error('[PartnerCadence] Error:', err.message);
    }
  });

  console.log('[Scheduler] Started — drip send (3min ticks, 1-3 per agent), IMAP poll (5min), auto-pull (1hr), partner cadence (5min)');
}

// =====================================================
// PARTNER CADENCE PROCESSING
// =====================================================

async function processPartnerCadences() {
  // Get all active partner enrollments
  const [enrollments] = await pool.query(
    `SELECT pe.*, p.email AS prospect_email, p.first_name, p.last_name, p.company,
            a.name AS agent_name, a.smtp_user AS agent_smtp_user, a.email AS agent_email,
            pa.name AS partner_name, pa.email AS partner_email,
            ps.name AS sequence_name
     FROM partner_enrollments pe
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     JOIN agents pa ON pa.id = pe.partner_agent_id
     JOIN partner_sequences ps ON ps.id = pe.sequence_id
     WHERE pe.status IN ('active', 'waiting_partner')
     AND ps.status = 'active'`
  );

  for (const enrollment of enrollments) {
    try {
      // Get the current step
      const [steps] = await pool.execute(
        'SELECT * FROM partner_sequence_steps WHERE sequence_id = ? AND step_number = ?',
        [enrollment.sequence_id, enrollment.current_step]
      );

      if (steps.length === 0) {
        // Sequence completed
        await pool.execute(
          `UPDATE partner_enrollments SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [enrollment.id]
        );
        console.log(`[PartnerCadence] ${enrollment.first_name} ${enrollment.last_name} - sequence completed`);
        continue;
      }

      const step = steps[0];

      // Determine if this step is due
      let isDue = false;

      if (step.step_type === 'agent_send_cc') {
        // Step 1: check days since enrollment
        const [timeCheck] = await pool.execute(
          `SELECT DATE_ADD(pe.enrolled_at, INTERVAL ? DAY) AS due_at
           FROM partner_enrollments pe WHERE pe.id = ?`,
          [step.delay_days, enrollment.id]
        );
        isDue = new Date(timeCheck[0].due_at) <= new Date();

      } else if (step.step_type === 'partner_reply') {
        // Step 2: always check on every tick while waiting
        isDue = true;

      } else if (step.step_type === 'agent_followup') {
        // Steps 3-6: calculate days since partner replied
        if (!enrollment.partner_replied_at) continue;
        const daysSincePartnerReply = (Date.now() - new Date(enrollment.partner_replied_at).getTime()) / (1000 * 60 * 60 * 24);
        isDue = daysSincePartnerReply >= step.delay_days;
      }

      if (!isDue) continue;

      // ---- STEP TYPE: agent_send_cc (Step 1) ----
      if (step.step_type === 'agent_send_cc') {
        const subject = personalizeContent(step.subject_line, enrollment);
        const body = personalizeContent(step.body_html, enrollment);
        const fromEmail = enrollment.agent_smtp_user || enrollment.agent_email;

        // Random delay for natural sending
        const delaySec = Math.floor(Math.random() * 60) + 15;
        await randomDelay(delaySec * 1000, delaySec * 1000);

        // Send with CC to partner
        await sendMail({
          fromEmail,
          to: enrollment.prospect_email,
          cc: enrollment.partner_email,
          subject,
          html: body,
        });

        // Log to sent_emails
        await pool.execute(
          `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [enrollment.prospect_id, enrollment.agent_id, subject, body]
        );

        // Wait for Graph to index the message, then grab conversationId + messageId
        let conversationId = null;
        let messageId = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          await randomDelay(5000, 8000);
          const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.prospect_email });
          if (lastSent?.conversationId) {
            conversationId = lastSent.conversationId;
            messageId = lastSent.id;
            break;
          }
          console.log(`[PartnerCadence] Waiting for Graph to index sent message (attempt ${attempt + 1}/3)...`);
        }

        // Update enrollment: advance to step 2, set waiting_partner
        await pool.execute(
          `UPDATE partner_enrollments
           SET current_step = 2, status = 'waiting_partner',
               conversation_id = ?, last_message_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [conversationId, messageId, enrollment.id]
        );

        if (!conversationId) {
          console.log(`[PartnerCadence] WARNING: Could not get conversationId for ${enrollment.prospect_email} - will retry on next tick`);
        } else {
          console.log(`[PartnerCadence] ${enrollment.agent_name} -> ${enrollment.prospect_email} (Step 1, CC: ${enrollment.partner_name})`);
        }
      }

      // ---- STEP TYPE: partner_reply (Step 2) ----
      else if (step.step_type === 'partner_reply' && enrollment.status === 'waiting_partner') {
        // If we still don't have a conversationId, try to get it
        if (!enrollment.conversation_id) {
          const fromEmail = enrollment.agent_smtp_user || enrollment.agent_email;
          const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.prospect_email });
          if (lastSent?.conversationId) {
            await pool.execute(
              `UPDATE partner_enrollments SET conversation_id = ?, last_message_id = ? WHERE id = ?`,
              [lastSent.conversationId, lastSent.id, enrollment.id]
            );
            enrollment.conversation_id = lastSent.conversationId;
            enrollment.last_message_id = lastSent.id;
            console.log(`[PartnerCadence] Recovered conversationId for ${enrollment.prospect_email}`);
          } else {
            continue; // Still no conversationId, try again next tick
          }
        }

        // Check the AGENT's inbox for a reply from the partner on this thread
        // (Partner is external, so we can't read their mailbox - but when they
        //  reply-all, the agent gets a copy in their inbox)
        try {
          const agentMailbox = enrollment.agent_smtp_user || enrollment.agent_email;
          const partnerReplies = await getInboxByConversation({
            email: agentMailbox,
            conversationId: enrollment.conversation_id,
            fromEmail: enrollment.partner_email,
          });

          if (partnerReplies && partnerReplies.length > 0) {
            // Partner has replied! Advance to step 3
            const partnerMsg = partnerReplies[0];

            await pool.execute(
              `UPDATE partner_enrollments
               SET current_step = 3, status = 'active',
                   partner_replied_at = ?, last_message_id = ?, updated_at = NOW()
               WHERE id = ?`,
              [new Date(partnerMsg.receivedDateTime), partnerMsg.id, enrollment.id]
            );

            console.log(`[PartnerCadence] Partner ${enrollment.partner_name} replied for ${enrollment.first_name} ${enrollment.last_name} - advancing to Step 3`);
          }
        } catch (err) {
          console.error(`[PartnerCadence] Error checking for partner reply: ${err.message}`);
        }
      }

      // ---- STEP TYPE: agent_followup (Steps 3-6) ----
      else if (step.step_type === 'agent_followup' && enrollment.status === 'active') {
        const body = personalizeContent(step.body_html, enrollment);
        const fromEmail = enrollment.agent_smtp_user || enrollment.agent_email;

        // Random delay
        const delaySec = Math.floor(Math.random() * 60) + 15;
        await randomDelay(delaySec * 1000, delaySec * 1000);

        // Try to reply in the same thread using the last message ID
        if (enrollment.last_message_id) {
          try {
            const draft = await replyToMessage({
              fromEmail,
              messageId: enrollment.last_message_id,
              html: body,
            });
            console.log(`[PartnerCadence] ${enrollment.agent_name} -> ${enrollment.prospect_email} (Step ${enrollment.current_step} in-thread reply)`);
          } catch (replyErr) {
            // If reply-to-thread fails, send as standalone with Re: subject
            console.log(`[PartnerCadence] Thread reply failed (${replyErr.message}), sending standalone`);
            const subject = `Re: ${personalizeContent(enrollment.sequence_name, enrollment)}`;
            await sendMail({ fromEmail, to: enrollment.prospect_email, subject, html: body });
          }
        } else {
          // No thread to reply to - send standalone
          const subject = `Re: ${personalizeContent(enrollment.sequence_name, enrollment)}`;
          await sendMail({ fromEmail, to: enrollment.prospect_email, subject, html: body });
        }

        // Log to sent_emails
        await pool.execute(
          `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [enrollment.prospect_id, enrollment.agent_id, `Partner cadence Step ${enrollment.current_step}`, body]
        );

        // Get updated message ID for thread continuity on next step
        await randomDelay(5000, 8000);
        const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.prospect_email });

        // Advance to next step
        const nextStep = enrollment.current_step + 1;
        await pool.execute(
          `UPDATE partner_enrollments
           SET current_step = ?, last_message_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [nextStep, lastSent?.id || enrollment.last_message_id, enrollment.id]
        );
      }
    } catch (err) {
      console.error(`[PartnerCadence] Error processing ${enrollment.first_name} ${enrollment.last_name}: ${err.message}`);
    }
  }
}
