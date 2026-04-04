import { Router } from 'express';
import pool from '../db/connection.js';

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
      `SELECT id, agent_id, subject, body_html, sent_at, 'sent' AS direction
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

// PUT /:id/action - mark as actioned
router.put('/:id/action', async (req, res) => {
  try {
    const { action_type } = req.body;
    if (!action_type) return res.status(400).json({ error: 'action_type is required' });

    await pool.execute(
      'UPDATE received_emails SET actioned = 1, action_type = ?, actioned_at = NOW() WHERE id = ?',
      [action_type, req.params.id]
    );

    const [rows] = await pool.execute('SELECT * FROM received_emails WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Email not found' });
    res.json(rows[0]);
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

    // Insert into sent_emails as a reply
    const [result] = await pool.execute(
      `INSERT INTO sent_emails (agent_id, prospect_id, subject, body_html, sent_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [original.agent_id, original.prospect_id, `Re: ${original.subject}`, body]
    );

    // Mark original as actioned
    await pool.execute(
      "UPDATE received_emails SET actioned = 1, action_type = 'replied', actioned_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    // TODO: actually send via SMTP service using agent's SMTP config

    res.json({ message: 'Reply queued', sentEmailId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
