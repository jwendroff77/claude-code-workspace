import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import pool from '../db/connection.js';
import { classifyReply, generateReplyDraft } from './ai.js';

let graphClient = null;

function getClient() {
  if (graphClient) return graphClient;

  const credential = new ClientSecretCredential(
    process.env.MS_TENANT_ID,
    process.env.MS_CLIENT_ID,
    process.env.MS_CLIENT_SECRET
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

// Check for new emails via Microsoft Graph API (replaces IMAP)
export async function checkNewEmails(agent) {
  // Need the M365 login email (smtp_user) to read their mailbox
  const mailbox = agent.smtp_user || agent.email;
  if (!mailbox || agent.role === 'manual') return [];

  const client = getClient();
  const newEmails = [];

  try {
    // Get unread messages from inbox received in the last 24 hours
    const since = new Date();
    since.setHours(since.getHours() - 24);
    const sinceStr = since.toISOString();

    const messages = await client
      .api(`/users/${mailbox}/mailFolders/Inbox/messages`)
      .filter(`isRead eq false and receivedDateTime ge ${sinceStr}`)
      .select('id,subject,from,bodyPreview,body,receivedDateTime')
      .top(50)
      .orderby('receivedDateTime desc')
      .get();

    for (const msg of messages.value) {
      const fromEmail = msg.from?.emailAddress?.address;
      if (!fromEmail) continue;

      // Skip system/noreply emails
      if (fromEmail.includes('noreply') || fromEmail.includes('mailer-daemon') || fromEmail.includes('postmaster')) {
        continue;
      }

      // Check if we already logged this email (by subject + from + approximate time)
      const [existing] = await pool.execute(
        `SELECT id FROM received_emails
         WHERE agent_id = ? AND from_email = ? AND subject = ?
         AND received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [agent.id, fromEmail, msg.subject || '(no subject)']
      );

      if (existing.length > 0) continue; // Already processed

      // Check if this is from a known prospect
      const [prospects] = await pool.execute(
        'SELECT id, assigned_agent_id FROM prospects WHERE email = ?',
        [fromEmail]
      );

      const prospectId = prospects.length > 0 ? prospects[0].id : null;

      // Extract plain text from body
      const bodyText = msg.bodyPreview || '';

      // Store in received_emails
      const [result] = await pool.execute(
        `INSERT INTO received_emails (prospect_id, agent_id, from_email, subject, body, body_text, received_at, sentiment)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'neutral')`,
        [
          prospectId,
          agent.id,
          fromEmail,
          msg.subject || '(no subject)',
          msg.body?.content || bodyText,
          bodyText,
          new Date(msg.receivedDateTime),
        ]
      );

      // If from a known prospect, pause their sequence and update status
      if (prospectId) {
        await pool.execute(
          `UPDATE prospect_sequence_enrollment
           SET status = 'paused', paused_at = NOW()
           WHERE prospect_id = ? AND status = 'active'`,
          [prospectId]
        );

        await pool.execute(
          `UPDATE prospects SET status = 'replied', updated_at = NOW()
           WHERE id = ? AND status = 'in_sequence'`,
          [prospectId]
        );

        await pool.execute(
          `INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes)
           VALUES (?, 'in_sequence', 'replied', ?, 'Auto-paused: prospect replied')`,
          [prospectId, agent.id]
        );

        console.log(`[Inbox] ${agent.name}: Reply from ${fromEmail} (prospect #${prospectId}) - sequence paused`);

        // AI: Analyze sentiment and generate draft reply (async, non-blocking)
        (async () => {
          try {
            const replyText = bodyText || msg.body?.content || '';
            const classResult = await classifyReply(replyText);
            const sentiment = classResult.classification;

            // Update sentiment and classification details on the received email
            await pool.execute(
              'UPDATE received_emails SET sentiment = ?, classification_details = ? WHERE id = ?',
              [sentiment, JSON.stringify(classResult), result.insertId]
            );

            // Update A/B variant reply stats
            try {
              const { recordVariantReply } = await import('../routes/ab.js');
              await recordVariantReply(prospectId, sentiment);
            } catch (e) { /* non-fatal */ }

            // Generate draft reply for actionable replies
            const skipDraft = ['negative', 'ooo'].includes(sentiment);
            if (!skipDraft) {
              // Get prospect details
              const [prospectRows] = await pool.execute(
                'SELECT * FROM prospects WHERE id = ?',
                [prospectId]
              );
              if (prospectRows.length > 0) {
                // Get conversation thread for context
                const [sentThread] = await pool.execute(
                  `SELECT id, subject, body AS body_html, sent_at, 'sent' AS direction
                   FROM sent_emails WHERE prospect_id = ? ORDER BY sent_at DESC LIMIT 3`,
                  [prospectId]
                );
                const [recvThread] = await pool.execute(
                  `SELECT id, subject, body_text, received_at AS sent_at, 'received' AS direction
                   FROM received_emails WHERE prospect_id = ? ORDER BY received_at DESC LIMIT 3`,
                  [prospectId]
                );
                const thread = [...sentThread, ...recvThread]
                  .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));

                const draft = await generateReplyDraft({
                  prospect: prospectRows[0],
                  agent,
                  incomingEmail: replyText,
                  thread,
                });

                await pool.execute(
                  'UPDATE received_emails SET ai_draft_reply = ? WHERE id = ?',
                  [draft, result.insertId]
                );

                console.log(`[AI] ${agent.name}: Draft reply generated for ${fromEmail} (${sentiment})`);
              }
            }

            // Meeting booking detection - check for Calendly/Cal.com confirmations
            const bookingPatterns = [
              /new event has been scheduled/i,
              /meeting confirmed/i,
              /confirmed for/i,
              /calendly\.com.*confirmed/i,
              /cal\.com.*confirmed/i,
              /booked a meeting/i,
              /appointment confirmed/i,
            ];
            const isBookingConfirmation = bookingPatterns.some(p => p.test(replyText));
            if (isBookingConfirmation || sentiment === 'meeting_request') {
              // Check if it's a real booking confirmation (has a date/time)
              if (isBookingConfirmation) {
                await pool.execute(
                  "UPDATE prospects SET status = 'booked', updated_at = NOW() WHERE id = ?",
                  [prospectId]
                );
                await pool.execute(
                  `UPDATE prospect_sequence_enrollment SET status = 'cancelled'
                   WHERE prospect_id = ? AND status IN ('active', 'paused')`,
                  [prospectId]
                );
                await pool.execute(
                  `INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes)
                   VALUES (?, 'replied', 'booked', ?, 'Auto-detected: meeting booking confirmation')`,
                  [prospectId, agent.id]
                );
                console.log(`[Booking] ${agent.name}: Meeting booked with ${fromEmail} (auto-detected)`);
              }
            }
          } catch (aiErr) {
            console.error(`[AI] Draft/sentiment failed for ${fromEmail}:`, aiErr.message);
          }
        })();
      } else {
        console.log(`[Inbox] ${agent.name}: New email from ${fromEmail} (not a known prospect)`);
      }

      // Mark as read in Microsoft so we don't process again
      try {
        await client
          .api(`/users/${mailbox}/messages/${msg.id}`)
          .update({ isRead: true });
      } catch (markErr) {
        // Non-fatal - we'll skip it next time via our DB dedup check
      }

      newEmails.push({
        id: result.insertId,
        from: fromEmail,
        subject: msg.subject,
        prospectId,
      });
    }
  } catch (err) {
    console.error(`[Inbox] Graph API error for ${agent.name} (${mailbox}):`, err.message);
  }

  return newEmails;
}

// Check for bounce/NDR emails and mark prospects as bounced
export async function checkBounces(agent) {
  const mailbox = agent.smtp_user || agent.email;
  if (!mailbox || agent.role === 'manual') return [];

  const client = getClient();
  const bounces = [];

  try {
    // Search for NDR/bounce emails in the last 48 hours
    const since = new Date();
    since.setHours(since.getHours() - 48);
    const sinceStr = since.toISOString();

    // Query for common NDR sender patterns and subjects
    const messages = await client
      .api(`/users/${mailbox}/mailFolders/Inbox/messages`)
      .filter(
        `receivedDateTime ge ${sinceStr} and (` +
        `contains(from/emailAddress/address, 'mailer-daemon') or ` +
        `contains(from/emailAddress/address, 'postmaster') or ` +
        `contains(subject, 'Undeliverable') or ` +
        `contains(subject, 'Delivery Status Notification') or ` +
        `contains(subject, 'Mail delivery failed') or ` +
        `contains(subject, 'Returned mail') or ` +
        `contains(subject, 'delivery has failed')` +
        `)`
      )
      .select('id,subject,from,body,bodyPreview,receivedDateTime')
      .top(50)
      .get();

    for (const msg of messages.value) {
      // Extract the bounced email address from the NDR body
      const bouncedEmail = extractBouncedEmail(msg.body?.content || msg.bodyPreview || '', msg.subject || '');
      if (!bouncedEmail) continue;

      // Check if already in exclusion list
      const [existing] = await pool.execute(
        'SELECT id FROM exclusion_list WHERE email = ?',
        [bouncedEmail]
      );
      if (existing.length > 0) {
        // Already handled - just mark as read
        try {
          await client.api(`/users/${mailbox}/messages/${msg.id}`).update({ isRead: true });
        } catch (e) { /* non-fatal */ }
        continue;
      }

      // Find the prospect
      const [prospects] = await pool.execute(
        'SELECT id, status FROM prospects WHERE email = ?',
        [bouncedEmail]
      );

      if (prospects.length > 0) {
        const prospect = prospects[0];

        // Update prospect status to bounced
        await pool.execute(
          "UPDATE prospects SET status = 'bounced', updated_at = NOW() WHERE id = ?",
          [prospect.id]
        );

        // Cancel all active/paused sequences
        await pool.execute(
          `UPDATE prospect_sequence_enrollment SET status = 'cancelled'
           WHERE prospect_id = ? AND status IN ('active', 'paused')`,
          [prospect.id]
        );

        // Cancel partner enrollments too
        await pool.execute(
          `UPDATE partner_enrollments SET status = 'cancelled'
           WHERE prospect_id = ? AND status IN ('active', 'waiting_partner')`,
          [prospect.id]
        );

        // Mark the sent email as bounced
        await pool.execute(
          `UPDATE sent_emails SET status = 'bounced'
           WHERE prospect_id = ? AND status = 'sent'
           ORDER BY sent_at DESC LIMIT 1`,
          [prospect.id]
        );

        // Log pipeline event
        await pool.execute(
          `INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes)
           VALUES (?, ?, 'bounced', ?, 'Auto-bounced: email undeliverable')`,
          [prospect.id, prospect.status, agent.id]
        );
      }

      // Add to exclusion list regardless of whether prospect was found
      await pool.execute(
        "INSERT INTO exclusion_list (email, reason, added_at) VALUES (?, 'bounced', NOW())",
        [bouncedEmail]
      );

      // Mark NDR as read
      try {
        await client.api(`/users/${mailbox}/messages/${msg.id}`).update({ isRead: true });
      } catch (e) { /* non-fatal */ }

      console.log(`[Bounce] ${agent.name}: ${bouncedEmail} removed (NDR detected)`);
      bounces.push(bouncedEmail);
    }
  } catch (err) {
    console.error(`[Bounce] Graph API error for ${agent.name} (${mailbox}):`, err.message);
  }

  return bounces;
}

// Extract bounced email address from NDR body content
function extractBouncedEmail(body, subject) {
  // Strip HTML tags for easier parsing
  const text = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');

  // Common patterns in NDR emails:
  // 1. "Delivery has failed to these recipients or groups: user@domain.com"
  // 2. "The following message to <user@domain.com> was undeliverable"
  // 3. "550 5.1.1 <user@domain.com>"
  // 4. "Original-Recipient: rfc822;user@domain.com"
  // 5. "Final-Recipient: rfc822;user@domain.com"
  // 6. Subject often contains the bounced address

  const patterns = [
    /Final-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/i,
    /Original-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/i,
    /Delivery.*?failed.*?<([^>]+@[^>]+)>/i,
    /undeliverable.*?<([^>]+@[^>]+)>/i,
    /rejected.*?<([^>]+@[^>]+)>/i,
    /550\s+\d\.\d\.\d\s+<?([^\s<>]+@[^\s<>]+)>?/i,
    /could\s+not\s+be\s+delivered\s+to[:\s]+<?([^\s<>,]+@[^\s<>,]+)>?/i,
    /recipients?\s+or\s+groups?[:\s]+<?([^\s<>,]+@[^\s<>,]+)>?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const email = match[1].trim().toLowerCase();
      // Validate it looks like a real email and isn't a system address
      if (email.includes('@') && !email.includes('mailer-daemon') && !email.includes('postmaster')) {
        return email;
      }
    }
  }

  // Fallback: check subject line for email address
  const subjectMatch = subject.match(/<?([^\s<>]+@[^\s<>]+\.[a-z]{2,})>?/i);
  if (subjectMatch && subjectMatch[1]) {
    const email = subjectMatch[1].trim().toLowerCase();
    if (!email.includes('mailer-daemon') && !email.includes('postmaster')) {
      return email;
    }
  }

  return null;
}

// Test inbox connection via Graph API
export async function testImapConnection(agent) {
  const mailbox = agent.smtp_user || agent.email;
  const client = getClient();
  try {
    await client.api(`/users/${mailbox}/mailFolders/Inbox`).select('displayName,totalItemCount').get();
    return { success: true, message: `Graph API inbox access verified for ${mailbox}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}
