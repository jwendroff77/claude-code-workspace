import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - get all prospects grouped by status for kanban view
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, e.agent_id, e.sequence_id, a.name AS agent_name
       FROM prospects p
       LEFT JOIN enrollments e ON e.prospect_id = p.id
       LEFT JOIN agents a ON e.agent_id = a.id
       ORDER BY p.updated_at DESC`
    );

    const grouped = {};
    for (const row of rows) {
      const status = row.status || 'new';
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(row);
    }

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - conversion metrics between stages
router.get('/stats', async (req, res) => {
  try {
    const [statusCounts] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM prospects GROUP BY status'
    );

    const [recentMoves] = await pool.query(
      `SELECT old_status, new_status, COUNT(*) AS count
       FROM pipeline_events
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY old_status, new_status
       ORDER BY count DESC`
    );

    const totals = {};
    for (const row of statusCounts) {
      totals[row.status] = row.count;
    }

    res.json({ totals, conversions: recentMoves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:prospectId/move - move prospect to new status
router.put('/:prospectId/move', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const [existing] = await pool.execute(
      'SELECT id, status FROM prospects WHERE id = ?',
      [req.params.prospectId]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Prospect not found' });

    const oldStatus = existing[0].status;

    await pool.execute('UPDATE prospects SET status = ? WHERE id = ?', [status, req.params.prospectId]);

    await pool.execute(
      'INSERT INTO pipeline_events (prospect_id, old_status, new_status, notes) VALUES (?, ?, ?, ?)',
      [req.params.prospectId, oldStatus, status, notes || null]
    );

    const [rows] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [req.params.prospectId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
