import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import pool from '../db/connection.js';

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
