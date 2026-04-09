import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - list tasks with filters
router.get('/', async (req, res) => {
  try {
    const { agent_id, status, task_type } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (agent_id) { where += ' AND t.agent_id = ?'; params.push(agent_id); }
    if (status) { where += ' AND t.status = ?'; params.push(status); }
    if (task_type) { where += ' AND t.task_type = ?'; params.push(task_type); }

    const [rows] = await pool.query(
      `SELECT t.*,
              p.first_name, p.last_name, p.company, p.title AS prospect_title,
              p.linkedin_url, p.email AS prospect_email,
              a.name AS agent_name
       FROM tasks t
       JOIN prospects p ON p.id = t.prospect_id
       JOIN agents a ON a.id = t.agent_id
       ${where}
       ORDER BY t.status ASC, t.due_date ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /counts - task counts by agent
router.get('/counts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT agent_id, COUNT(*) AS pending_count
      FROM tasks WHERE status = 'pending'
      GROUP BY agent_id
    `);
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM tasks WHERE status = 'pending'");
    res.json({ byAgent: rows, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create a task
router.post('/', async (req, res) => {
  try {
    const { prospect_id, agent_id, task_type, title, description, due_date } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO tasks (prospect_id, agent_id, task_type, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)',
      [prospect_id, agent_id, task_type, title, description || null, due_date || null]
    );
    res.json({ id: result.insertId, message: 'Task created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/complete - mark task as completed
router.put('/:id/complete', async (req, res) => {
  try {
    await pool.execute(
      "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Task completed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/skip - skip task
router.put('/:id/skip', async (req, res) => {
  try {
    await pool.execute(
      "UPDATE tasks SET status = 'skipped', completed_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Task skipped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /bulk-complete - bulk complete tasks
router.post('/bulk-complete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(
      `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id IN (${placeholders})`,
      ids
    );
    res.json({ message: `${ids.length} tasks completed` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: auto-create LinkedIn tasks at step boundaries
export async function createLinkedInTask(prospectId, agentId, stepNumber) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = tomorrow.toISOString().split('T')[0];

  // Get prospect info for task title
  const [prospects] = await pool.execute(
    'SELECT first_name, last_name, company, linkedin_url FROM prospects WHERE id = ?',
    [prospectId]
  );
  if (prospects.length === 0) return;
  const p = prospects[0];

  if (stepNumber === 2) {
    // After Step 2: create LinkedIn connect request task
    await pool.execute(
      'INSERT INTO tasks (prospect_id, agent_id, task_type, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)',
      [
        prospectId, agentId, 'linkedin_connect',
        `Connect with ${p.first_name} ${p.last_name} on LinkedIn`,
        `${p.first_name} ${p.last_name} at ${p.company || 'Unknown'}.${p.linkedin_url ? ' Profile: ' + p.linkedin_url : ' Search LinkedIn for their profile.'}`,
        dueDate,
      ]
    );
  } else if (stepNumber === 4) {
    // After Step 4: create LinkedIn message task
    await pool.execute(
      'INSERT INTO tasks (prospect_id, agent_id, task_type, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)',
      [
        prospectId, agentId, 'linkedin_message',
        `Send LinkedIn message to ${p.first_name} ${p.last_name}`,
        `Follow up with a brief LinkedIn message. Reference the email sequence. Keep it to 2-3 sentences.${p.linkedin_url ? ' Profile: ' + p.linkedin_url : ''}`,
        dueDate,
      ]
    );
  }
}

export default router;
