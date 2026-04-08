import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import pool from '../db/connection.js';
import { testGraphConnection } from '../services/graph.js';

const router = Router();

// GET / - list all agents
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM agents ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - get agent by id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - update agent
router.put('/:id', async (req, res) => {
  try {
    const {
      name, title, persona_voice,
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email,
      imap_host, imap_port, imap_user, imap_pass,
      daily_send_limit, send_window_start, send_window_end, send_days,
      queue_threshold, max_daily_pull, apollo_query_json, status,
    } = req.body;

    const fields = [];
    const values = [];

    const mappings = {
      name, title, persona_voice,
      smtp_host, smtp_port, smtp_user,
      smtp_pass_encrypted: smtp_pass,
      smtp_from_email,
      imap_host, imap_port, imap_user,
      imap_pass_encrypted: imap_pass,
      daily_send_limit, send_window_start, send_window_end, send_days,
      queue_threshold, max_daily_pull, apollo_query_json, status,
    };

    for (const [key, val] of Object.entries(mappings)) {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'apollo_query_json' && typeof val === 'object' ? JSON.stringify(val) : val);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await pool.execute(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM agents WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/test-smtp - test email connection via Graph API
router.post('/:id/test-smtp', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT smtp_user, email FROM agents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const fromEmail = rows[0].smtp_user || rows[0].email;
    const result = await testGraphConnection(fromEmail);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /:id/test-imap - test IMAP connection placeholder
router.post('/:id/test-imap', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT imap_host, imap_port, imap_user, imap_pass_encrypted FROM agents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const { imap_host, imap_port, imap_user, imap_pass_encrypted } = rows[0];
    if (!imap_host) return res.status(400).json({ error: 'IMAP not configured for this agent' });

    const client = new ImapFlow({
      host: imap_host,
      port: imap_port || 993,
      secure: true,
      auth: { user: imap_user, pass: imap_pass_encrypted },
      logger: false,
    });

    await client.connect();
    await client.logout();
    res.json({ success: true, message: 'IMAP connection verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/sent - get sent emails for an agent from database
router.get('/:id/sent', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT se.id, se.agent_id, se.subject, se.body, se.sent_at,
              p.first_name, p.last_name, p.email AS to_email, p.company
       FROM sent_emails se
       LEFT JOIN prospects p ON p.id = se.prospect_id
       WHERE se.agent_id = ?
       ORDER BY se.sent_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
