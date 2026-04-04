import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET /credits - get Apollo credit usage info
router.get('/credits', async (req, res) => {
  try {
    const [[settings]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'apollo_api_key'"
    );
    if (!settings) return res.status(400).json({ error: 'Apollo API key not configured' });

    const response = await fetch('https://api.apollo.io/v1/auth/health', {
      headers: { 'x-api-key': settings.value, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /search - search Apollo for prospects
router.post('/search', async (req, res) => {
  try {
    const [[settings]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'apollo_api_key'"
    );
    if (!settings) return res.status(400).json({ error: 'Apollo API key not configured' });

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'x-api-key': settings.value, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /import - import prospects from Apollo with dedup check
router.post('/import', async (req, res) => {
  try {
    const { prospects, agent_id, source } = req.body;

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return res.status(400).json({ error: 'prospects array is required' });
    }

    const imported = [];
    const duplicates = [];

    for (const p of prospects) {
      // Dedup check by email
      const [existing] = await pool.execute(
        'SELECT id FROM prospects WHERE email = ?',
        [p.email]
      );

      if (existing.length > 0) {
        duplicates.push(p.email);
        continue;
      }

      const [result] = await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.first_name || null, p.last_name || null, p.email,
          p.organization_name || p.company || null,
          p.title || null, p.phone || null,
          p.linkedin_url || null, source || 'apollo'
        ]
      );

      imported.push({ id: result.insertId, email: p.email });
    }

    // Log the pull
    await pool.execute(
      `INSERT INTO apollo_pulls (agent_id, query_json, results_count, imported_count)
       VALUES (?, ?, ?, ?)`,
      [agent_id || null, JSON.stringify(req.body.query || {}), prospects.length, imported.length]
    );

    res.json({
      imported: imported.length,
      duplicates: duplicates.length,
      importedRecords: imported,
      duplicateEmails: duplicates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /pulls - list recent Apollo pull history
router.get('/pulls', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ap.*, a.name AS agent_name
       FROM apollo_pulls ap
       LEFT JOIN agents a ON ap.agent_id = a.id
       ORDER BY ap.created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auto-pull/:agentId - trigger auto-pull for an agent
router.post('/auto-pull/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;

    const [agents] = await pool.execute(
      'SELECT * FROM agents WHERE id = ?',
      [agentId]
    );
    if (agents.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const agent = agents[0];
    if (!agent.apollo_query_json) {
      return res.status(400).json({ error: 'Agent has no Apollo query configured' });
    }

    const [[settings]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'apollo_api_key'"
    );
    if (!settings) return res.status(400).json({ error: 'Apollo API key not configured' });

    const query = typeof agent.apollo_query_json === 'string'
      ? JSON.parse(agent.apollo_query_json)
      : agent.apollo_query_json;

    query.per_page = agent.max_daily_pull || 25;

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'x-api-key': settings.value, 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });
    const data = await response.json();

    const people = data.people || [];
    let importedCount = 0;

    for (const p of people) {
      if (!p.email) continue;

      const [existing] = await pool.execute('SELECT id FROM prospects WHERE email = ?', [p.email]);
      if (existing.length > 0) continue;

      await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'apollo')`,
        [
          p.first_name || null, p.last_name || null, p.email,
          p.organization?.name || null, p.title || null,
          p.phone_numbers?.[0]?.sanitized_number || null,
          p.linkedin_url || null
        ]
      );
      importedCount++;
    }

    await pool.execute(
      `INSERT INTO apollo_pulls (agent_id, query_json, results_count, imported_count)
       VALUES (?, ?, ?, ?)`,
      [agentId, JSON.stringify(query), people.length, importedCount]
    );

    res.json({
      message: 'Auto-pull completed',
      found: people.length,
      imported: importedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
