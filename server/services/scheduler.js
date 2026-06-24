import cron from 'node-cron';
import pool from '../db/connection.js';
import { sendEmail, getTodaySendCount } from './smtp.js';
import { sendMail, getInboxByConversation, getLastSentTo, replyToMessage } from './graph.js';
import { generatePersonalizedOpener } from './ai.js';
import { getABVariant, recordVariantSend } from '../routes/ab.js';
import { createLinkedInTask } from '../routes/tasks.js';
import { recalculateAllScores } from './scoring.js';
import { checkDomainHealth } from './domain.js';

// ---- Business day helpers ----
// Holidays excluded from business day counts (fixed dates + computed floating holidays)
function getHolidays(year) {
  const h = new Set();
  h.add(`${year}-01-01`); // New Year's Day
  h.add(`${year}-07-04`); // July 4th
  h.add(`${year}-12-25`); // Christmas
  // Memorial Day: last Monday of May
  const may = new Date(year, 5, 0); // last day of May
  may.setDate(may.getDate() - ((may.getDay() + 6) % 7));
  h.add(may.toISOString().slice(0, 10));
  // Labor Day: first Monday of September
  const sep = new Date(year, 8, 1);
  sep.setDate(sep.getDate() + ((8 - sep.getDay()) % 7 || 7));
  h.add(sep.toISOString().slice(0, 10));
  return h;
}

function countBusinessDays(startDate, endDate) {
  const cur = new Date(startDate);
  const end = new Date(endDate);
  cur.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() + 1); // start counting day after startDate
  let count = 0;
  while (cur <= end) {
    const dow = cur.getDay();
    const ds = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !getHolidays(cur.getFullYear()).has(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
// ---- End business day helpers ----

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

// Daily limit for an agent — no warmup ramp needed
// Domain is 22 months old, emails verified via NeverBounce, proper SPF/DKIM/DMARC,
// spaced sending (~13 min gaps), List-Unsubscribe headers, threaded conversations.
// This is normal business sending behavior.
function getEffectiveLimit(agent) {
  return agent.daily_send_limit;
}

// MySQL advisory lock to prevent multiple scheduler instances from running simultaneously.
// GET_LOCK returns 1 if acquired, 0 if timeout (another instance holds it).
// This works across separate Node processes and separate connection pools.
async function acquireSchedulerLock(connection, agentId) {
  const lockName = `scheduler_agent_${agentId}`;
  const [rows] = await connection.query(`SELECT GET_LOCK('${lockName}', 0) AS got_lock`);
  return rows[0].got_lock === 1;
}

async function releaseSchedulerLock(connection, agentId) {
  const lockName = `scheduler_agent_${agentId}`;
  await connection.query(`SELECT RELEASE_LOCK('${lockName}')`);
}

// Process send queue for a single agent — sends ONE email per tick
async function processAgentQueue(agent) {
  if (agent.status !== 'active' || agent.role === 'closer' || agent.role === 'manual') return 0;
  if (!isSendingDay(agent)) return 0;
  if (!isInSendWindow(agent)) return 0;

  // GLOBAL LOCK: Only one process can run the scheduler for this agent at a time
  // This prevents duplicate sends even if multiple server instances are running
  const lockConn = await pool.getConnection();
  const gotLock = await acquireSchedulerLock(lockConn, agent.id);
  if (!gotLock) {
    lockConn.release();
    console.log(`[Scheduler] ${agent.name}: another instance already processing - skipping`);
    return 0;
  }

  try {

  const effectiveLimit = getEffectiveLimit(agent);

  const sentToday = await getTodaySendCount(agent.id);
  if (sentToday >= effectiveLimit) { await releaseSchedulerLock(lockConn, agent.id); lockConn.release(); return 0; }

  const remaining = effectiveLimit - sentToday;
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

  // Partner cadence priority: if this agent has partner sends due right now, skip drip this tick
  const [pendingPartner] = await pool.execute(
    `SELECT COUNT(*) as cnt
     FROM partner_enrollments pe
     JOIN partner_sequences ps ON ps.id = pe.sequence_id
     WHERE pe.agent_id = ?
     AND pe.status IN ('active', 'waiting_partner')
     AND ps.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM sent_emails se
       WHERE se.prospect_id = pe.prospect_id AND se.agent_id = pe.agent_id AND DATE(se.sent_at) = CURDATE()
     )
     AND NOT EXISTS (
       SELECT 1 FROM partner_sequence_steps pss
       WHERE pss.sequence_id = pe.sequence_id AND pss.step_number = pe.current_step
         AND pss.step_type = 'agent_followup'
         AND (pe.partner_replied_at IS NULL OR DATEDIFF(NOW(), pe.partner_replied_at) < pss.delay_days)
     )`,
    [agent.id]
  );
  if (pendingPartner[0].cnt > 0) {
    console.log(`[Scheduler] ${agent.name}: ${pendingPartner[0].cnt} partner send(s) pending — holding drip this tick`);
    await releaseSchedulerLock(lockConn, agent.id);
    lockConn.release();
    return 0;
  }

  // Only send 1 email per tick per agent — true drip
  const maxThisTick = 1;

  // ATOMIC LOCK: Use a transaction with row-level locking to prevent race conditions
  // where multiple scheduler instances could grab the same enrollment.
  // SELECT FOR UPDATE locks the row, immediately mark it 'sending' so no other
  // process can pick it up, commit, then proceed.
  const connection = await pool.getConnection();
  let enrollments = [];
  try {
    await connection.beginTransaction();

    // Find and lock the next due enrollment for this agent
    // CRITICAL: Exclude prospects who already received ANY email today (prevents back-to-back steps)
    const [candidates] = await connection.query(
      `SELECT pse.id, pse.prospect_id, pse.sequence_id, pse.current_step,
              pse.conversation_id, pse.last_message_id,
              p.email, p.first_name, p.last_name, p.company, p.email_status
       FROM prospect_sequence_enrollment pse
       JOIN prospects p ON p.id = pse.prospect_id
       WHERE pse.agent_id = ${pool.escape(agent.id)} AND pse.status = 'active'
       AND DATE_ADD(pse.enrolled_at, INTERVAL (
         SELECT COALESCE(SUM(ss2.delay_days), 0)
         FROM sequence_steps ss2
         WHERE ss2.sequence_id = pse.sequence_id AND ss2.step_number <= pse.current_step
       ) DAY) <= NOW()
       AND NOT EXISTS (
         SELECT 1 FROM sent_emails se
         WHERE se.prospect_id = pse.prospect_id AND DATE(se.sent_at) = CURDATE()
       )
       LIMIT ${parseInt(maxThisTick)}
       FOR UPDATE`
    );

    if (candidates.length > 0) {
      // IMMEDIATELY mark as 'sending' so no other tick can pick this up
      // Status goes to 'sending', we'll set it back to 'active' after send completes
      await connection.execute(
        "UPDATE prospect_sequence_enrollment SET status = 'sending', paused_at = NOW() WHERE id = ?",
        [candidates[0].id]
      );
    }

    await connection.commit();
    enrollments = candidates;
  } catch (lockErr) {
    await connection.rollback();
    console.error(`[Scheduler] Lock error for ${agent.name}: ${lockErr.message}`);
  } finally {
    connection.release();
  }

  let sentCount = 0;

  for (const enrollment of enrollments) {
    // Email verification gate: skip invalid/disposable emails
    if (enrollment.email_status === 'invalid' || enrollment.email_status === 'disposable') {
      await pool.execute(
        "UPDATE prospect_sequence_enrollment SET status = 'cancelled' WHERE id = ?",
        [enrollment.id]
      );
      console.log(`[Scheduler] Skipping ${enrollment.email} - email_status: ${enrollment.email_status}`);
      continue;
    }

    // Get the current step content
    const [steps] = await pool.execute(
      `SELECT * FROM sequence_steps
       WHERE sequence_id = ? AND step_number = ?`,
      [enrollment.sequence_id, enrollment.current_step]
    );

    if (steps.length === 0) {
      // Sequence completed — mark completed (was 'sending' from the lock)
      await pool.execute(
        `UPDATE prospect_sequence_enrollment SET status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        [enrollment.id]
      );
      continue;
    }

    const step = steps[0];

    // A/B Testing: check if this step has an active test
    let abVariant = null;
    let useSubject = step.subject_line;
    let useBody = step.body_html || step.body_text;
    try {
      abVariant = await getABVariant(step.id);
      if (abVariant) {
        useSubject = abVariant.subject_line;
        useBody = abVariant.body_html;
      }
    } catch (abErr) {
      // Fall back to original step content
    }

    // Personalize content
    let subject = personalizeContent(useSubject, enrollment);
    let body = personalizeContent(useBody, enrollment);

    // AI Personalization: generate unique opener for Step 1
    let aiOpener = null;
    if (enrollment.current_step === 1) {
      try {
        // Check for cached opener first
        const [cachedRows] = await pool.execute(
          'SELECT personalized_opener FROM prospects WHERE id = ?',
          [enrollment.prospect_id]
        );
        const cached = cachedRows[0]?.personalized_opener;

        if (cached) {
          aiOpener = cached;
        } else {
          aiOpener = await generatePersonalizedOpener({ prospect: enrollment, agent });
          // Cache on prospect for re-enrollments
          await pool.execute(
            'UPDATE prospects SET personalized_opener = ? WHERE id = ?',
            [aiOpener, enrollment.prospect_id]
          );
        }

        // Replace {{aiOpener}} tag only - never prepend
        body = body.replace(/\{\{aiOpener\}\}/g, aiOpener);
      } catch (aiErr) {
        console.error(`[AI] Opener failed for ${enrollment.email}:`, aiErr.message);
        // Remove unfilled tag if AI failed
        body = body.replace(/\{\{aiOpener\}\}/g, '');
      }
    }

    try {
      // Random delay between emails: 45-120 seconds
      if (sentCount > 0) {
        const delaySec = Math.floor(Math.random() * 76) + 45;
        console.log(`[Scheduler] ${agent.name}: waiting ${delaySec}s before next send...`);
        await randomDelay(delaySec * 1000, delaySec * 1000);
      }

      const fromEmail = agent.smtp_user || agent.email;
      let sendResult;
      let threadedReply = false;

      // THREADING: Steps 2+ reply in the same thread as Step 1
      if (enrollment.current_step > 1 && enrollment.last_message_id) {
        try {
          await replyToMessage({ fromEmail, messageId: enrollment.last_message_id, html: body });
          threadedReply = true;

          // Log to sent_emails manually since we bypassed sendEmail()
          const [insertResult] = await pool.execute(
            `INSERT INTO sent_emails (prospect_id, agent_id, to_email, sequence_step_id, subject, body, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [enrollment.prospect_id, agent.id, enrollment.email, step.id, subject, body]
          );
          sendResult = { sentEmailId: insertResult.insertId };

          console.log(`[Scheduler] ${agent.name} -> ${enrollment.email} (step ${enrollment.current_step}, THREADED reply)`);
        } catch (threadErr) {
          console.log(`[Scheduler] Thread reply failed for ${enrollment.email}: ${threadErr.message}, sending as new email`);
          // Fall through to normal send below
        }
      }

      // Step 1 or thread reply failed: send as new email
      if (!threadedReply) {
        sendResult = await sendEmail({
          agent,
          to: enrollment.email,
          subject,
          html: body,
          text: step.body_text ? personalizeContent(step.body_text, enrollment) : undefined,
          prospectId: enrollment.prospect_id,
          stepId: step.id,
        });

        if (enrollment.current_step === 1) {
          console.log(`[Scheduler] ${agent.name} -> ${enrollment.email} (step 1, NEW thread${aiOpener ? ', AI opener' : ''}${abVariant ? `, variant ${abVariant.variant_label}` : ''})`);
        } else {
          console.log(`[Scheduler] ${agent.name} -> ${enrollment.email} (step ${enrollment.current_step}, standalone${abVariant ? `, variant ${abVariant.variant_label}` : ''})`);
        }
      }

      // CRITICAL: Advance step + release lock IMMEDIATELY after send success.
      console.log(`[ADVANCE-DEBUG] ${enrollment.email} enrollment=${enrollment.id} sendResult=${JSON.stringify(sendResult)} sentEmailId=${sendResult?.sentEmailId}`);
      if (sendResult?.sentEmailId) {
        const [advResult] = await pool.execute(
          "UPDATE prospect_sequence_enrollment SET current_step = current_step + 1, status = 'active', paused_at = NULL WHERE id = ?",
          [enrollment.id]
        );
        console.log(`[ADVANCE-DEBUG] ${enrollment.email} UPDATE result: affected=${advResult.affectedRows} changed=${advResult.changedRows}`);

        // VERIFY it actually changed
        const [verify] = await pool.execute('SELECT current_step, status FROM prospect_sequence_enrollment WHERE id = ?', [enrollment.id]);
        console.log(`[ADVANCE-DEBUG] ${enrollment.email} VERIFIED: step=${verify[0]?.current_step} status=${verify[0]?.status}`);

        sentCount++;
      } else {
        await pool.execute(
          "UPDATE prospect_sequence_enrollment SET status = 'active', paused_at = NULL WHERE id = ?",
          [enrollment.id]
        );
        console.error(`[ADVANCE-DEBUG] ${enrollment.email} NO sentEmailId - lock released without advance. sendResult was: ${JSON.stringify(sendResult)}`);
        continue;
      }

      // Post-processing wrapped in try/catch so any failure doesn't affect the advance
      try {
        // Store AI opener and A/B variant on the sent_email record
        if (sendResult?.sentEmailId) {
          const updates = [];
          const updateParams = [];
          if (aiOpener) { updates.push('ai_opener = ?'); updateParams.push(aiOpener); }
          if (abVariant) { updates.push('ab_variant_id = ?'); updateParams.push(abVariant.id); }
          if (updates.length > 0) {
            updateParams.push(sendResult.sentEmailId);
            await pool.execute(`UPDATE sent_emails SET ${updates.join(', ')} WHERE id = ?`, updateParams);
          }
          if (abVariant) {
            try { await recordVariantSend(abVariant.id); } catch (e) { /* non-fatal */ }
          }
        }

        // THREADING: After sending, grab the messageId from Graph for next step's reply
        await randomDelay(5000, 8000); // Wait 5-8s for Graph to index
        const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.email });
        if (lastSent?.id) {
          await pool.execute(
            'UPDATE prospect_sequence_enrollment SET conversation_id = ?, last_message_id = ? WHERE id = ?',
            [lastSent.conversationId || null, lastSent.id, enrollment.id]
          );
        }
      } catch (postErr) {
        console.log(`[Scheduler] Post-send processing failed for ${enrollment.email}: ${postErr.message} (send already committed)`);
      }

      // Create LinkedIn tasks at step boundaries (after Steps 2 and 4)
      try {
        // current_step was already incremented so subtract 1 to get the step we just sent
        await createLinkedInTask(enrollment.prospect_id, agent.id, enrollment.current_step);
      } catch (e) { /* non-fatal */ }
    } catch (err) {
      console.error(`Send failed for ${enrollment.email}:`, err.message);
      // RELEASE THE LOCK even on failure so enrollment isn't stuck in 'sending'
      // DO NOT advance step — send did not succeed
      try {
        await pool.execute(
          "UPDATE prospect_sequence_enrollment SET status = 'active', paused_at = NULL WHERE id = ?",
          [enrollment.id]
        );
      } catch (unlockErr) {
        console.error(`CRITICAL: Could not unlock enrollment ${enrollment.id}: ${unlockErr.message}`);
      }
    }
  }

  } catch (outerErr) {
    console.error(`[Scheduler] Outer error for ${agent.name}: ${outerErr.message}`);
  } finally {
    // ALWAYS release the global scheduler lock for this agent
    try {
      await releaseSchedulerLock(lockConn, agent.id);
      lockConn.release();
    } catch (e) { /* non-fatal */ }
  }

  return typeof sentCount !== 'undefined' ? sentCount : 0;
}

function personalizeContent(content, prospect) {
  if (!content) return '';
  let result = content
    .replace(/\{\{firstName\}\}/g, prospect.first_name || '')
    .replace(/\{\{lastName\}\}/g, prospect.last_name || '')
    .replace(/\{\{company\}\}/g, prospect.company || '')
    .replace(/\{\{email\}\}/g, prospect.email || '');
  // SAFETY NET: strip ANY remaining unfilled merge tags so {{anything}} never appears in sent email
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

// Main scheduler
export function startScheduler() {
  // Send queue processor — every 3 minutes (sends 1-3 emails per agent per tick)
  // With 30 daily limit and 9hr window (8am-5pm = 540min / 3min = 180 ticks)
  // That spreads 30 emails across 180 ticks = ~1 every 6 ticks = ~1 every 18 min per agent
  // Each agent is offset by a random delay so they don't all fire at the same second
  cron.schedule('*/3 * * * *', async () => {
    console.log(`[Scheduler] Drip tick fired at ${new Date().toISOString()}`);
    try {
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE role = 'outbound' AND status = 'active'"
      );

      console.log(`[Scheduler] Active outbound agents: ${agents.map(a => a.name).join(', ') || 'NONE'}`);

      // Shuffle agent order each tick so they don't always send in the same sequence
      const shuffled = agents.sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffled.length; i++) {
        const agent = shuffled[i];
        // Stagger agents: each one waits at least 60s more than the previous + 0-30s jitter
        // so sends are never bunched together (e.g. agents fire at ~0s, ~75s, ~150s, ~225s)
        const offsetSec = (i * 60) + Math.floor(Math.random() * 31);
        await randomDelay(offsetSec * 1000, offsetSec * 1000);

        const sent = await processAgentQueue(agent);
        if (sent > 0) {
          console.log(`[Scheduler] ${agent.name}: sent ${sent} email(s) this tick`);
        } else {
          console.log(`[Scheduler] ${agent.name}: no send this tick (gap/limit/window)`);
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

  // Bounce detection — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { checkBounces } = await import('./imap.js');
      const [agents] = await pool.execute(
        "SELECT * FROM agents WHERE status = 'active'"
      );

      for (const agent of agents) {
        const bounced = await checkBounces(agent);
        if (bounced.length > 0) {
          console.log(`[Bounce] ${agent.name}: ${bounced.length} bounce(s) detected`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Bounce check error:', err.message);
    }
  });

  // =====================================================
  // PARTNER CADENCE — RE-ENABLED for Ed + Lauren Signal Intel sends
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processPartnerCadences();
    } catch (err) {
      console.error('[PartnerCadence] Error:', err.message);
    }
  });
  //
  // Partner reply detection still runs (checks for Jared's replies)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkPartnerReplies();
    } catch (err) {
      console.error('[PartnerCadence] Reply check error:', err.message);
    }
  });

  // Hot prospect alerts — every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      // Find prospects who opened 3+ times but haven't replied and are still in sequence
      const [hotProspects] = await pool.query(`
        SELECT se.prospect_id, p.first_name, p.last_name, p.company, se.agent_id,
               MAX(se.open_count) AS max_opens, a.name AS agent_name
        FROM sent_emails se
        JOIN prospects p ON p.id = se.prospect_id
        JOIN agents a ON a.id = se.agent_id
        WHERE se.open_count >= 3
          AND p.status = 'in_sequence'
          AND se.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND NOT EXISTS (SELECT 1 FROM received_emails re WHERE re.prospect_id = se.prospect_id)
        GROUP BY se.prospect_id
      `);

      for (const hp of hotProspects) {
        console.log(`[HotAlert] ${hp.agent_name}: ${hp.first_name} ${hp.last_name} (${hp.company}) opened ${hp.max_opens}x - no reply yet`);
      }
    } catch (err) {
      console.error('[Scheduler] Hot alert error:', err.message);
    }
  });

  // Intent scoring — every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const updated = await recalculateAllScores();
      if (updated > 0) {
        console.log(`[Scoring] Recalculated intent scores for ${updated} prospects`);
      }
    } catch (err) {
      console.error('[Scheduler] Scoring error:', err.message);
    }
  });

  // Domain health check — daily at 7am CT (12pm UTC)
  cron.schedule('0 12 * * *', async () => {
    try {
      await checkDomainHealth('1cloudnow.com');
    } catch (err) {
      console.error('[Scheduler] Domain health error:', err.message);
    }
  });

  console.log('[Scheduler] Started — drip(3m), IMAP(5m), bounce(15m), hotAlerts(30m), autoPull(1h), scoring(1h), domainHealth(daily), partnerReplyCheck(5m)');
  console.log('[Scheduler] Partner cadence SENDING is MANUAL ONLY via /api/partner-cadence/send-next');
}

// =====================================================
// PARTNER REPLY DETECTION ONLY (no sending)
// Checks for Jared's reply-all on waiting_partner enrollments
// =====================================================

async function checkPartnerReplies() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIdx = new Date().getDay();
  if (todayIdx < 1 || todayIdx > 5) return; // Mon-Fri only

  const now = new Date();
  const ctHour = (now.getUTCHours() + 24 - 5) % 24;
  if (ctHour < 8 || ctHour >= 17) return; // 8am-5pm CT only

  const [enrollments] = await pool.query(
    `SELECT pe.*, p.email AS prospect_email, p.first_name, p.last_name,
            a.name AS agent_name, a.smtp_user AS agent_smtp_user, a.email AS agent_email,
            pa.name AS partner_name, pa.email AS partner_email
     FROM partner_enrollments pe
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     JOIN agents pa ON pa.id = pe.partner_agent_id
     WHERE pe.status = 'waiting_partner' AND pe.current_step = 2
     AND pe.updated_at < DATE_SUB(NOW(), INTERVAL 4 HOUR)`
  );

  for (const enrollment of enrollments) {
    if (!enrollment.conversation_id) continue;
    try {
      const agentMailbox = enrollment.agent_smtp_user || enrollment.agent_email;
      const partnerReplies = await getInboxByConversation({
        email: agentMailbox,
        conversationId: enrollment.conversation_id,
        fromEmail: enrollment.partner_email,
      });

      if (partnerReplies && partnerReplies.length > 0) {
        const partnerMsg = partnerReplies[0];
        await pool.execute(
          `UPDATE partner_enrollments
           SET current_step = 3, status = 'active',
               partner_replied_at = ?, last_message_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [new Date(partnerMsg.receivedDateTime), partnerMsg.id, enrollment.id]
        );
        console.log(`[PartnerCadence] Partner ${enrollment.partner_name} replied for ${enrollment.first_name} ${enrollment.last_name} - ready for Step 3`);
      }
    } catch (err) {
      console.error(`[PartnerCadence] Reply check error: ${err.message}`);
    }
  }
}

// =====================================================
// PARTNER CADENCE SENDING (exported for manual API use ONLY)
// =====================================================

async function processPartnerCadences() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = days[new Date().getDay()];
  const todayIdx = days.indexOf(today);
  if (todayIdx < 1 || todayIdx > 5) {
    return; // Mon-Fri only
  }

  const now = new Date();
  const ctOffset = -5; // CT (CDT is -5, CST is -6 — close enough for window guard)
  const ctHour = (now.getUTCHours() + 24 + ctOffset) % 24;
  const ctMinute = now.getUTCMinutes();
  if (ctHour < 8 || ctHour >= 17) {
    return; // 8am-5pm CT only
  }

  // Gap guard: minimum 4 minutes between partner cadence sends
  const [lastSendRows] = await pool.query(
    `SELECT MAX(se.sent_at) AS last_sent FROM sent_emails se
     JOIN partner_enrollments pe ON pe.prospect_id = se.prospect_id AND pe.agent_id = se.agent_id
     WHERE DATE(se.sent_at) = CURDATE()`
  );
  if (lastSendRows[0].last_sent) {
    const minsSinceLast = (now - new Date(lastSendRows[0].last_sent)) / 60000;
    if (minsSinceLast < 4) return;
  }

  // GLOBAL LOCK: prevent concurrent execution if multiple server instances are running
  const lockConn = await pool.getConnection();
  const [lockRows] = await lockConn.query(`SELECT GET_LOCK('partner_cadences', 0) AS got_lock`);
  if (lockRows[0].got_lock !== 1) {
    lockConn.release();
    console.log('[PartnerCadence] Another instance already running - skipping tick');
    return;
  }

  try {
  // Get all active partner enrollments — LIMIT 1 per tick for drip sending
  const [enrollments] = await pool.query(
    `SELECT pe.*, p.email AS prospect_email, p.first_name, p.last_name, p.company,
            p.industry, p.city, p.state, p.title AS prospect_title,
            p.signal_trigger_type, p.signal_headline, p.intent_score,
            a.name AS agent_name, a.smtp_user AS agent_smtp_user, a.email AS agent_email,
            a.persona_voice AS agent_persona,
            pa.name AS partner_name, pa.email AS partner_email,
            ps.name AS sequence_name
     FROM partner_enrollments pe
     JOIN prospects p ON p.id = pe.prospect_id
     JOIN agents a ON a.id = pe.agent_id
     JOIN agents pa ON pa.id = pe.partner_agent_id
     JOIN partner_sequences ps ON ps.id = pe.sequence_id
     WHERE pe.status IN ('active', 'waiting_partner')
     AND ps.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM sent_emails se
       WHERE se.prospect_id = pe.prospect_id
         AND se.agent_id = pe.agent_id
         AND DATE(se.sent_at) = CURDATE()
     )
     AND NOT EXISTS (
       SELECT 1 FROM partner_sequence_steps pss
       WHERE pss.sequence_id = pe.sequence_id
         AND pss.step_number = pe.current_step
         AND pss.step_type = 'agent_followup'
         AND pe.partner_replied_at IS NULL
     )
     -- Only pick enrollments at a SENDABLE step. partner_reply (step 2) just waits
     -- for the partner and is handled by checkPartnerReplies; including it here let
     -- step-2 enrollments starve step-1 sends every tick (LIMIT 1).
     AND EXISTS (
       SELECT 1 FROM partner_sequence_steps pss2
       WHERE pss2.sequence_id = pe.sequence_id
         AND pss2.step_number = pe.current_step
         AND pss2.step_type IN ('agent_send_cc', 'agent_followup')
     )
     ORDER BY pe.partner_replied_at ASC, pe.current_step DESC, pe.enrolled_at ASC
     LIMIT 1`
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
        // Steps 3-6: count business days since partner replied (excludes weekends + holidays)
        if (!enrollment.partner_replied_at) continue;
        const bizDaysSinceReply = countBusinessDays(new Date(enrollment.partner_replied_at), new Date());
        isDue = bizDaysSinceReply >= step.delay_days;
      }

      if (!isDue) continue;

      // ---- STEP TYPE: agent_send_cc (Step 1) ----
      if (step.step_type === 'agent_send_cc') {
        const fromEmail = enrollment.agent_smtp_user || enrollment.agent_email;

        // Generate AI opener for Step 1
        let aiOpener = '';
        try {
          aiOpener = await generatePersonalizedOpener({
            prospect: enrollment,
            agent: { name: enrollment.agent_name, title: '', persona_voice: enrollment.agent_persona || '' },
          });
          await pool.execute('UPDATE prospects SET personalized_opener = ? WHERE id = ?', [aiOpener, enrollment.prospect_id]);
        } catch (aiErr) {
          console.log(`[PartnerCadence] AI opener failed for ${enrollment.prospect_email}: ${aiErr.message}`);
        }

        // Personalize content - aiOpener tag gets replaced, safety net strips any remaining tags
        let body = step.body_html || '';
        body = body.replace(/\{\{aiOpener\}\}/g, aiOpener);
        body = personalizeContent(body, enrollment);
        const subject = personalizeContent(step.subject_line, enrollment);

        // Random delay for natural sending
        const delaySec = Math.floor(Math.random() * 60) + 15;
        await randomDelay(delaySec * 1000, delaySec * 1000);

        // BCC Jonathan ONLY on the Baird Medical step-1 TEST send (enrollment 1032).
        // Scoped to the test so the rest of the Ed batch is NOT BCC'd. Remove after test confirmed.
        const bccJonathan = (enrollment.id === 1032)
          ? 'jonathan@1cloudcommunications.com' : undefined;

        await sendMail({
          fromEmail,
          to: enrollment.prospect_email,
          cc: enrollment.partner_email,
          bcc: bccJonathan,
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
          try {
            await randomDelay(5000, 8000);
            const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.prospect_email });
            if (lastSent?.conversationId) {
              conversationId = lastSent.conversationId;
              messageId = lastSent.id;
              break;
            }
          } catch (e) {
            console.log(`[PartnerCadence] getLastSentTo failed (attempt ${attempt + 1}/3): ${e.message}`);
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
            await replyToMessage({
              fromEmail,
              messageId: enrollment.last_message_id,
              html: body,
            });
            console.log(`[PartnerCadence] ${enrollment.agent_name} -> ${enrollment.prospect_email} (Step ${enrollment.current_step} in-thread reply)`);
          } catch (replyErr) {
            // If reply-to-thread fails, send standalone CC'ing partner so they stay in the loop
            console.log(`[PartnerCadence] Thread reply failed (${replyErr.message}), sending standalone CC partner`);
            const subject = `Re: ${personalizeContent(enrollment.sequence_name, enrollment)}`;
            await sendMail({ fromEmail, to: enrollment.prospect_email, cc: enrollment.partner_email, subject, html: body });
          }
        } else {
          // No thread to reply to - send standalone CC'ing partner
          const subject = `Re: ${personalizeContent(enrollment.sequence_name, enrollment)}`;
          await sendMail({ fromEmail, to: enrollment.prospect_email, cc: enrollment.partner_email, subject, html: body });
        }

        // Log to sent_emails
        await pool.execute(
          `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [enrollment.prospect_id, enrollment.agent_id, `Partner cadence Step ${enrollment.current_step}`, body]
        );

        // Capture new message ID for thread continuity — non-fatal if Graph rejects filter
        await randomDelay(5000, 8000);
        let updatedMessageId = enrollment.last_message_id;
        try {
          const lastSent = await getLastSentTo({ fromEmail, toEmail: enrollment.prospect_email });
          if (lastSent?.id) updatedMessageId = lastSent.id;
        } catch (graphErr) {
          console.log(`[PartnerCadence] getLastSentTo failed (${graphErr.message}) - keeping existing message ID`);
        }

        // Advance to next step
        const nextStep = enrollment.current_step + 1;
        await pool.execute(
          `UPDATE partner_enrollments
           SET current_step = ?, last_message_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [nextStep, updatedMessageId, enrollment.id]
        );
      }
    } catch (err) {
      console.error(`[PartnerCadence] Error processing ${enrollment.first_name} ${enrollment.last_name}: ${err.message}`);
    }
  }
  } finally {
    try {
      await lockConn.query(`SELECT RELEASE_LOCK('partner_cadences')`);
      lockConn.release();
    } catch (e) { /* non-fatal */ }
  }
}
