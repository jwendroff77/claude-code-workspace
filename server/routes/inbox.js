import { Router } from 'express';
import pool from '../db/connection.js';
import { sendEmail } from '../services/smtp.js';

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

        // Cancel any active sequences
        await pool.execute(
          `UPDATE prospect_sequence_enrollment SET status = 'cancelled' WHERE prospect_id = ? AND status IN ('active', 'paused')`,
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

// POST /:id/reply - send reply as agent (placeholder for SMTP service)
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

    // Get the prospect's email address
    const [prospectRows] = await pool.execute('SELECT email FROM prospects WHERE id = ?', [original.prospect_id]);
    const toEmail = prospectRows.length > 0 ? prospectRows[0].email : original.from_email;

    // Send reply via Graph API and log to sent_emails
    const result = await sendEmail({
      agent,
      to: toEmail,
      subject: `Re: ${original.subject}`,
      html: body,
      prospectId: original.prospect_id,
    });

    // Mark original as actioned
    await pool.execute(
      "UPDATE received_emails SET actioned = 1, action_type = 'replied', actioned_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    res.json({ message: 'Reply sent', messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
