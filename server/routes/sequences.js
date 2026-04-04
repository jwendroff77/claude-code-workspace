import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - list all sequences with step counts
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, COUNT(ss.id) AS step_count
       FROM sequences s
       LEFT JOIN sequence_steps ss ON ss.sequence_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - get sequence with all steps
router.get('/:id', async (req, res) => {
  try {
    const [seqRows] = await pool.execute('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
    if (seqRows.length === 0) return res.status(404).json({ error: 'Sequence not found' });

    const [steps] = await pool.execute(
      'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_order',
      [req.params.id]
    );

    res.json({ ...seqRows[0], steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create sequence
router.post('/', async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const [result] = await pool.execute(
      'INSERT INTO sequences (name, description, type) VALUES (?, ?, ?)',
      [name, description || null, type || 'email']
    );

    const [rows] = await pool.execute('SELECT * FROM sequences WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - update sequence metadata
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'description', 'type', 'status'];
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
    await pool.execute(`UPDATE sequences SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM sequences WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sequence not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - delete sequence
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM sequences WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Sequence not found' });
    res.json({ message: 'Sequence deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/steps - add step to sequence
router.post('/:id/steps', async (req, res) => {
  try {
    const { step_order, step_type, delay_days, subject_template, body_template, variant_label } = req.body;

    // Auto-determine step_order if not provided
    let order = step_order;
    if (order === undefined) {
      const [[{ maxOrder }]] = await pool.execute(
        'SELECT COALESCE(MAX(step_order), 0) AS maxOrder FROM sequence_steps WHERE sequence_id = ?',
        [req.params.id]
      );
      order = maxOrder + 1;
    }

    const [result] = await pool.execute(
      `INSERT INTO sequence_steps (sequence_id, step_order, step_type, delay_days, subject_template, body_template, variant_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, order, step_type || 'email', delay_days || 0, subject_template, body_template, variant_label || null]
    );

    const [rows] = await pool.execute('SELECT * FROM sequence_steps WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /steps/:stepId - update a step
router.put('/steps/:stepId', async (req, res) => {
  try {
    const allowed = ['step_order', 'step_type', 'delay_days', 'subject_template', 'body_template', 'variant_label'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.stepId);
    await pool.execute(`UPDATE sequence_steps SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM sequence_steps WHERE id = ?', [req.params.stepId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Step not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /steps/:stepId - delete a step
router.delete('/steps/:stepId', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM sequence_steps WHERE id = ?', [req.params.stepId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Step not found' });
    res.json({ message: 'Step deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/assign - assign agents to sequence
router.post('/:id/assign', async (req, res) => {
  try {
    const { agentIds } = req.body;
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ error: 'agentIds array is required' });
    }

    const sequenceId = req.params.id;

    // Verify sequence exists
    const [seq] = await pool.execute('SELECT id FROM sequences WHERE id = ?', [sequenceId]);
    if (seq.length === 0) return res.status(404).json({ error: 'Sequence not found' });

    // Remove existing assignments and re-assign
    await pool.execute('DELETE FROM agent_sequences WHERE sequence_id = ?', [sequenceId]);

    const insertValues = agentIds.map(agentId => [agentId, sequenceId]);
    if (insertValues.length > 0) {
      const placeholders = insertValues.map(() => '(?, ?)').join(', ');
      const flat = insertValues.flat();
      await pool.execute(
        `INSERT INTO agent_sequences (agent_id, sequence_id) VALUES ${placeholders}`,
        flat
      );
    }

    res.json({ message: `Assigned ${agentIds.length} agent(s) to sequence`, agentIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
