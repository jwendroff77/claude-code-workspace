import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - get all settings
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings ORDER BY `key`');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:key - get specific setting
router.get('/:key', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM settings WHERE `key` = ?',
      [req.params.key]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Setting not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT / - update settings (single or array)
router.put('/', async (req, res) => {
  try {
    const updates = Array.isArray(req.body) ? req.body : [req.body];

    for (const { key, value } of updates) {
      if (!key) continue;
      await pool.execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );
    }

    const [rows] = await pool.query('SELECT * FROM settings ORDER BY `key`');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
