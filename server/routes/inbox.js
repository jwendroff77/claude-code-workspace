import { Router } from 'express';
import pool from '../db/connection.js';
import { sendEmail } from '../services/smtp.js';
import { replyToMessage, getLastSentTo } from '../services/graph.js';
import { generateReplyDraft } from '../services/ai.js';

const router = Router();

// GET / - list received emails with prospect/agent info
router.get('/', async (req, res) => {
  try {
    const { agent_id, actioned, sentiment } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (agent_id) {
      where += ' AND r.agent_id = ?';
      params.push(agent_id);
    }
    if (actioned !== undefined) {
      where += ' AND r.actioned = ?';
      params.push(parseInt(actioned));
    }
    if (sentiment) {
      where += ' AND r.sentiment = ?';
      params.push(sentiment);
    }

    const [rows] = await pool.query(
      `SELECT r.*,
              p.first_name, p.last_name, p.email AS prospect_email, p.company,
              a.name AS agent_name
       FROM received_emails r
       LEFT JOIN prospects p ON r.prospect_id = p.id
       LEFT JOIN agents a ON r.agent_id = a.id
       ${where}
       ORDER BY r.received_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Live Inbox (Graph API direct) ---

async function getGraphClient() {
  const { Client } = await import('@microsoft/microsoft-graph-client');
  const { ClientSecretCredential } = await import('@azure/identity');
  const { TokenCredentialAuthenticationProvider } = await import(
    '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js'
  );
  const credential = new ClientSecretCredential(
    process.env.MS_TENANT_ID, process.env.MS_CLIENT_ID, process.env.MS_CLIENT_SECRET
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return Client.initWithMiddleware({ authProvider });
}

// GET /live/:agentId - list real-time inbox messages from Graph API (last 14 days)
router.get('/live/:agentId', async (req, res) => {
  try {
    const [agentRows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [req.params.agentId]);
    if (agentRows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    const agent = agentRows[0];
    const fromEmail = agent.smtp_user || agent.email;
    if (!fromEmail) return res.status(400).json({ error: 'Agent has no email configured' });

    const client = await getGraphClient();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const messages = await client
      .api(`/users/${fromEmail}/mailFolders/Inbox/messages`)
      .filter(`receivedDateTime ge ${twoWeeksAgo}`)
      .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,conversationId,hasAttachments')
      .top(50)
      .orderby('receivedDateTime desc')
      .get();

    res.json({ agentEmail: fromEmail, agentName: agent.name, messages: messages.value || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /live/:agentId/message/:messageId - get full message body
router.get('/live/:agentId/message/:messageId', async (req, res) => {
  try {
    const [agentRows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [req.params.agentId]);
    if (agentRows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    const agent = agentRows[0];
    const fromEmail = agent.smtp_user || agent.email;

    const client = await getGraphClient();
    const message = await client
      .api(`/users/${fromEmail}/messages/${req.params.messageId}`)
      .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,conversationId,isRead')
      .get();

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /live/:agentId/reply - threaded reply via Graph API replyAll
router.post('/live/:agentId/reply', async (req, res) => {
  try {
    const { messageId, body } = req.body;
    if (!messageId || !body) return res.status(400).json({ error: 'messageId and body are required' });

    const [agentRows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [req.params.agentId]);
    if (agentRows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    const agent = agentRows[0];
    const fromEmail = agent.smtp_user || agent.email;

    await replyToMessage({ fromEmail, messageId, html: body });

    res.json({ message: 'Reply sent (threaded)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - get single received email with full thread
router.get('/:id', async (req, res) => {
  try {
    const [emailRows] = await pool.execute(
      `SELECT r.*,
              p.first_name, p.last_name, p.email AS prospect_email, p.company,
              a.name AS agent_name
       FROM received_emails r
       LEFT JOIN prospects p ON r.prospect_id = p.id
       LEFT JOIN agents a ON r.agent_id = a.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (emailRows.length === 0) return res.status(404).json({ error: 'Email not found' });

    const email = emailRows[0];

    // Get full thread: sent and received emails for this prospect
    const [sent] = await pool.execute(
      `SELECT id, agent_id, subject, body AS body_html, sent_at, 'sent' AS direction
       FROM sent_emails
       WHERE prospect_id = ?
       ORDER BY sent_at`,
      [email.prospect_id]
    );

    const [received] = await pool.execute(
      `SELECT id, agent_id, subject, body_text, received_at AS sent_at, 'received' AS direction
       FROM received_emails
       WHERE prospect_id = ?
       ORDER BY received_at`,
      [email.prospect_id]
    );

    const thread = [...sent, ...received].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));

    res.json({ ...email, thread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/action - mark as actioned and update prospect status
router.put('/:id/action', async (req, res) => {
  try {
    const { action_type } = req.body;
    if (!action_type) return res.status(400).json({ error: 'action_type is required' });

    // Mark email as actioned
    await pool.execute(
      'UPDATE received_emails SET actioned = 1, action_type = ?, actioned_at = NOW() WHERE id = ?',
      [action_type, req.params.id]
    );

    const [rows] = await pool.execute('SELECT * FROM received_emails WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Email not found' });

    const email = rows[0];

    // Update prospect status and pipeline based on action
    if (email.prospect_id) {
      let newStatus = null;

      if (action_type === 'book_appointment') {
        newStatus = 'booked';
      } else if (action_type === 'hand_off') {
        newStatus = 'handed_off';
      } else if (action_type === 'disqualify') {
        newStatus = 'disqualified';
      }

      if (newStatus) {
        // Get current status for pipeline event
        const [prospect] = await pool.execute('SELECT status FROM prospects WHERE id = ?', [email.prospect_id]);
        const oldStatus = prospect.length > 0 ? prospect[0].status : 'replied';

        // Update prospect status
        await pool.execute(
          'UPDATE prospects SET status = ?, updated_at = NOW() WHERE id = ?',
          [newStatus, email.prospect_id]
        );

        // Cancel any active sequences — BOTH tracks. Historically only the drip
        // table was cancelled here, so disqualified/booked/handed-off prospects
        // stayed live in the partner cadence and could get follow-ups later.
        await pool.execute(
          `UPDATE prospect_sequence_enrollment SET status = 'cancelled' WHERE prospect_id = ? AND status IN ('active', 'paused')`,
          [email.prospect_id]
        );
        await pool.execute(
          `UPDATE partner_enrollments SET status = 'cancelled', completed_at = NOW()
           WHERE prospect_id = ? AND status IN ('active', 'waiting_partner', 'paused')`,
          [email.prospect_id]
        );

        // Log pipeline event
        await pool.execute(
          'INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?, ?, ?, ?, ?)',
          [email.prospect_id, oldStatus, newStatus, email.agent_id, `Action: ${action_type}`]
        );
      }
    }

    res.json({ ...email, action_type, message: `Action '${action_type}' applied` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - delete a received email from inbox
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM received_emails WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Email not found' });

    await pool.execute('DELETE FROM received_emails WHERE id = ?', [req.params.id]);
    res.json({ message: 'Email deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /bulk - delete multiple emails
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(`DELETE FROM received_emails WHERE id IN (${placeholders})`, ids);
    res.json({ message: `Deleted ${ids.length} email(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/regenerate-draft - regenerate AI draft reply
router.post('/:id/regenerate-draft', async (req, res) => {
  try {
    const [emailRows] = await pool.execute(
      'SELECT * FROM received_emails WHERE id = ?',
      [req.params.id]
    );
    if (emailRows.length === 0) return res.status(404).json({ error: 'Email not found' });

    const email = emailRows[0];
    if (!email.prospect_id) return res.status(400).json({ error: 'No prospect linked to this email' });

    // Get prospect + agent
    const [prospectRows] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [email.prospect_id]);
    const [agentRows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [email.agent_id]);
    if (prospectRows.length === 0 || agentRows.length === 0) {
      return res.status(400).json({ error: 'Prospect or agent not found' });
    }

    // Get thread
    const [sentThread] = await pool.execute(
      `SELECT id, subject, body AS body_html, sent_at, 'sent' AS direction
       FROM sent_emails WHERE prospect_id = ? ORDER BY sent_at DESC LIMIT 3`,
      [email.prospect_id]
    );
    const [recvThread] = await pool.execute(
      `SELECT id, subject, body_text, received_at AS sent_at, 'received' AS direction
       FROM received_emails WHERE prospect_id = ? ORDER BY received_at DESC LIMIT 3`,
      [email.prospect_id]
    );
    const thread = [...sentThread, ...recvThread]
      .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));

    const draft = await generateReplyDraft({
      prospect: prospectRows[0],
      agent: agentRows[0],
      incomingEmail: email.body_text || email.body || '',
      thread,
    });

    await pool.execute(
      'UPDATE received_emails SET ai_draft_reply = ? WHERE id = ?',
      [draft, req.params.id]
    );

    res.json({ ai_draft_reply: draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/reply - send threaded reply as agent via Graph API createReply
router.post('/:id/reply', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Reply body is required' });

    const [emailRows] = await pool.execute(
      'SELECT * FROM received_emails WHERE id = ?',
      [req.params.id]
    );
    if (emailRows.length === 0) return res.status(404).json({ error: 'Email not found' });

    const original = emailRows[0];

    // Get the agent so we can send as them
    const [agentRows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [original.agent_id]);
    if (agentRows.length === 0) return res.status(400).json({ error: 'Agent not found for this email' });
    const agent = agentRows[0];
    const fromEmail = agent.smtp_user || agent.email;

    // Get the prospect's email address
    const [prospectRows] = await pool.execute('SELECT email FROM prospects WHERE id = ?', [original.prospect_id]);
    const toEmail = prospectRows.length > 0 ? prospectRows[0].email : original.from_email;

    // Find the most recent message in this thread from either direction
    // so we can reply in-thread via Graph API createReply
    let threadSent = false;

    // First try: find the prospect's reply in the agent's Graph inbox and reply to it
    try {
      const { Client } = await import('@microsoft/microsoft-graph-client');
      const { ClientSecretCredential } = await import('@azure/identity');
      const { TokenCredentialAuthenticationProvider } = await import('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js');

      const credential = new ClientSecretCredential(
        process.env.MS_TENANT_ID, process.env.MS_CLIENT_ID, process.env.MS_CLIENT_SECRET
      );
      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });
      const client = Client.initWithMiddleware({ authProvider });

      // Search agent's inbox for the prospect's reply by subject + sender
      const messages = await client
        .api(`/users/${fromEmail}/mailFolders/Inbox/messages`)
        .filter(`from/emailAddress/address eq '${toEmail}' and contains(subject, '${original.subject.replace(/'/g, "''")}')`)
        .select('id,subject,conversationId,receivedDateTime')
        .top(5)
        .orderby('receivedDateTime desc')
        .get();

      if (messages.value && messages.value.length > 0) {
        // Reply to the most recent message in the thread
        const messageId = messages.value[0].id;
        await replyToMessage({ fromEmail, messageId, html: body });
        threadSent = true;
        console.log(`[Reply] ${agent.name} -> ${toEmail} (in-thread reply to messageId ${messageId})`);
      }
    } catch (graphErr) {
      console.error(`[Reply] Thread lookup failed: ${graphErr.message}`);
    }

    // Fallback: if thread reply failed, try finding our last sent message and reply to that
    if (!threadSent) {
      try {
        const lastSent = await getLastSentTo({ fromEmail, toEmail });
        if (lastSent?.id) {
          await replyToMessage({ fromEmail, messageId: lastSent.id, html: body });
          threadSent = true;
          console.log(`[Reply] ${agent.name} -> ${toEmail} (in-thread reply to last sent)`);
        }
      } catch (fallbackErr) {
        console.error(`[Reply] Sent-thread fallback failed: ${fallbackErr.message}`);
      }
    }

    // Last resort: send as new email (should rarely happen)
    if (!threadSent) {
      console.log(`[Reply] ${agent.name} -> ${toEmail} (WARNING: sending as new email, no thread found)`);
      await sendEmail({
        agent, to: toEmail,
        subject: `Re: ${original.subject}`,
        html: body,
        prospectId: original.prospect_id,
      });
    }

    // Log to sent_emails
    await pool.execute(
      `INSERT INTO sent_emails (prospect_id, agent_id, to_email, subject, body, sent_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [original.prospect_id, agent.id, toEmail, `Re: ${original.subject}`, body]
    );

    // Mark original as actioned
    await pool.execute(
      "UPDATE received_emails SET actioned = 1, action_type = 'replied', actioned_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    res.json({ message: 'Reply sent (threaded)', threaded: threadSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
