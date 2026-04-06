import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - list prospects with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { status, agent_id, search } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      where += ' AND p.status = ?';
      params.push(status);
    }
    if (agent_id) {
      where += ' AND e.agent_id = ?';
      params.push(agent_id);
    }
    if (search) {
      where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.email LIKE ? OR p.company LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const countParams = [...params];
    params.push(limit, offset);

    const [rows] = await pool.query(
      `SELECT p.*, e.agent_id, e.sequence_id, e.current_step, e.status AS enrollment_status
       FROM prospects p
       LEFT JOIN enrollments e ON e.prospect_id = p.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM prospects p
       LEFT JOIN enrollments e ON e.prospect_id = p.id
       ${where}`,
      countParams
    );

    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - get single prospect with enrollment info
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*, e.agent_id, e.sequence_id, e.current_step, e.status AS enrollment_status
       FROM prospects p
       LEFT JOIN enrollments e ON e.prospect_id = p.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create prospect
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, email, company, title, phone, linkedin_url, source, agent_id } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const [result] = await pool.execute(
      `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, email, company, title, phone, linkedin_url, source || 'manual']
    );

    const [rows] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Prospect with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - update prospect
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['first_name', 'last_name', 'email', 'company', 'title', 'phone', 'linkedin_url', 'source'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await pool.execute(`UPDATE prospects SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/status - update prospect status with pipeline event
router.put('/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const [existing] = await pool.execute('SELECT status FROM prospects WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Prospect not found' });

    const oldStatus = existing[0].status;

    await pool.execute('UPDATE prospects SET status = ? WHERE id = ?', [status, req.params.id]);

    await pool.execute(
      `INSERT INTO pipeline_events (prospect_id, old_status, new_status, notes)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, oldStatus, status, notes || null]
    );

    const [rows] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - soft delete: mark as disqualified
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT id, status FROM prospects WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Prospect not found' });

    const oldStatus = existing[0].status;

    await pool.execute("UPDATE prospects SET status = 'disqualified' WHERE id = ?", [req.params.id]);

    await pool.execute(
      `INSERT INTO pipeline_events (prospect_id, old_status, new_status, notes)
       VALUES (?, ?, 'disqualified', 'Marked as disqualified via DELETE')`,
      [req.params.id, oldStatus]
    );

    res.json({ message: 'Prospect marked as disqualified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /scrub - get prospects pending scrub for a specific agent
router.get('/scrub/:agentId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM prospects
       WHERE assigned_agent_id = ? AND status = 'pending_scrub'
       ORDER BY company, last_name`,
      [req.params.agentId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /scrub/approve - bulk approve prospects (move from pending_scrub to in_sequence)
router.post('/scrub/approve', async (req, res) => {
  try {
    const { prospect_ids } = req.body;
    if (!prospect_ids || !prospect_ids.length) {
      return res.status(400).json({ error: 'No prospect IDs provided' });
    }
    const placeholders = prospect_ids.map(() => '?').join(',');
    await pool.execute(
      `UPDATE prospects SET status = 'in_sequence', updated_at = NOW()
       WHERE id IN (${placeholders}) AND status = 'pending_scrub'`,
      prospect_ids
    );
    res.json({ message: `${prospect_ids.length} prospects approved`, count: prospect_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /scrub/reject - bulk reject/scrub prospects (remove from pipeline)
router.post('/scrub/reject', async (req, res) => {
  try {
    const { prospect_ids, reason } = req.body;
    if (!prospect_ids || !prospect_ids.length) {
      return res.status(400).json({ error: 'No prospect IDs provided' });
    }
    const placeholders = prospect_ids.map(() => '?').join(',');
    await pool.execute(
      `UPDATE prospects SET status = 'scrubbed', updated_at = NOW()
       WHERE id IN (${placeholders})`,
      prospect_ids
    );

    // Log pipeline events for each
    for (const id of prospect_ids) {
      await pool.execute(
        `INSERT INTO pipeline_events (prospect_id, from_status, to_status, notes)
         VALUES (?, 'pending_scrub', 'scrubbed', ?)`,
        [id, reason || 'Account scrub — cannot work this account']
      );
    }

    res.json({ message: `${prospect_ids.length} prospects scrubbed`, count: prospect_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
