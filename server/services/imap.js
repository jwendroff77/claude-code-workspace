import { ImapFlow } from 'imapflow';
import pool from '../db/connection.js';

// Create IMAP client for an agent
function createClient(agent) {
  return new ImapFlow({
    host: agent.imap_host,
    port: agent.imap_port || 993,
    secure: true,
    auth: {
      user: agent.imap_user,
      pass: agent.imap_pass_encrypted, // TODO: decrypt in production
    },
    logger: false,
  });
}

// Check for new emails for a specific agent
export async function checkNewEmails(agent) {
  const client = createClient(agent);
  const newEmails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for unseen messages from the last 24 hours
      const since = new Date();
      since.setHours(since.getHours() - 24);

      for await (const message of client.fetch(
        { seen: false, since },
        { envelope: true, source: true }
      )) {
        const fromEmail = message.envelope.from?.[0]?.address;
        if (!fromEmail) continue;

        // Check if this is from a known prospect
        const [prospects] = await pool.execute(
          'SELECT id, assigned_agent_id FROM prospects WHERE email = ? AND assigned_agent_id = ?',
          [fromEmail, agent.id]
        );

        const prospectId = prospects.length > 0 ? prospects[0].id : null;

        // Store in received_emails
        const [result] = await pool.execute(
          `INSERT INTO received_emails (prospect_id, agent_id, from_email, subject, body, received_at, sentiment)
           VALUES (?, ?, ?, ?, ?, NOW(), 'neutral')`,
          [
            prospectId,
            agent.id,
            fromEmail,
            message.envelope.subject || '(no subject)',
            message.source?.toString() || '',
          ]
        );

        // If from a known prospect, pause their sequence
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

          // Log pipeline event
          await pool.execute(
            `INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes)
             VALUES (?, 'in_sequence', 'replied', ?, 'Auto-paused: prospect replied')`,
            [prospectId, agent.id]
          );
        }

        newEmails.push({
          id: result.insertId,
          from: fromEmail,
          subject: message.envelope.subject,
          prospectId,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error(`IMAP error for ${agent.email}:`, err.message);
  }

  return newEmails;
}

// Test IMAP connection
export async function testImapConnection(agent) {
  const client = createClient(agent);
  try {
    await client.connect();
    await client.logout();
    return { success: true, message: 'IMAP connection successful' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}
