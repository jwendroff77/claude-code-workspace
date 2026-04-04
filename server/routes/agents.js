import { Router } from 'express';
import nodemailer from 'nodemailer';
import pool from '../db/connection.js';

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
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email,
      imap_host, imap_port, imap_user, imap_pass,
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

// POST /:id/test-smtp - test SMTP connection
router.post('/:id/test-smtp', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT smtp_host, smtp_port, smtp_user, smtp_pass FROM agents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const { smtp_host, smtp_port, smtp_user, smtp_pass } = rows[0];
    if (!smtp_host) return res.status(400).json({ error: 'SMTP not configured for this agent' });

    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port || 587,
      secure: smtp_port === 465,
      auth: { user: smtp_user, pass: smtp_pass },
    });

    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection verified' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /:id/test-imap - test IMAP connection placeholder
router.post('/:id/test-imap', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT imap_host, imap_port, imap_user, imap_pass FROM agents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const { imap_host } = rows[0];
    if (!imap_host) return res.status(400).json({ error: 'IMAP not configured for this agent' });

    // TODO: implement actual IMAP connection test
    res.json({ success: true, message: 'IMAP test placeholder - not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
