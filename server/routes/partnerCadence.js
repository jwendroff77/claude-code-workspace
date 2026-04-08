import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - list all partner sequences with agent/partner names
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.*,
              a.name AS agent_name, a.email AS agent_email,
              pa.name AS partner_name, pa.email AS partner_email,
              COUNT(DISTINCT pss.id) AS step_count,
              COUNT(DISTINCT pe.id) AS enrollment_count
       FROM partner_sequences ps
       JOIN agents a ON a.id = ps.agent_id
       JOIN agents pa ON pa.id = ps.partner_agent_id
       LEFT JOIN partner_sequence_steps pss ON pss.sequence_id = ps.id
       LEFT JOIN partner_enrollments pe ON pe.sequence_id = ps.id AND pe.status IN ('active', 'waiting_partner')
       GROUP BY ps.id
       ORDER BY ps.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - get partner sequence with steps
router.get('/:id', async (req, res) => {
  try {
    const [seqRows] = await pool.execute(
      `SELECT ps.*,
              a.name AS agent_name, a.email AS agent_email, a.smtp_user AS agent_smtp_user,
              pa.name AS partner_name, pa.email AS partner_email
       FROM partner_sequences ps
       JOIN agents a ON a.id = ps.agent_id
       JOIN agents pa ON pa.id = ps.partner_agent_id
       WHERE ps.id = ?`,
      [req.params.id]
    );
    if (seqRows.length === 0) return res.status(404).json({ error: 'Partner sequence not found' });

    const [steps] = await pool.execute(
      'SELECT * FROM partner_sequence_steps WHERE sequence_id = ? ORDER BY step_number',
      [req.params.id]
    );

    res.json({ ...seqRows[0], steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /enrollments/all - list all partner enrollments with prospect/agent info
router.get('/enrollments/all', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pe.*,
              p.first_name, p.last_name, p.email AS prospect_email, p.company, p.title,
              a.name AS agent_name,
              pa.name AS partner_name,
              ps.name AS sequence_name
       FROM partner_enrollments pe
       JOIN prospects p ON p.id = pe.prospect_id
       JOIN agents a ON a.id = pe.agent_id
       JOIN agents pa ON pa.id = pe.partner_agent_id
       JOIN partner_sequences ps ON ps.id = pe.sequence_id
       ORDER BY pe.enrolled_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /enroll - enroll a prospect in a partner sequence
router.post('/enroll', async (req, res) => {
  try {
    const { prospect_id, sequence_id } = req.body;
    if (!prospect_id || !sequence_id) {
      return res.status(400).json({ error: 'prospect_id and sequence_id are required' });
    }

    // Get the sequence to know agent + partner
    const [seqs] = await pool.execute('SELECT * FROM partner_sequences WHERE id = ?', [sequence_id]);
    if (seqs.length === 0) return res.status(404).json({ error: 'Partner sequence not found' });
    const seq = seqs[0];

    // Check prospect isn't already enrolled in this partner sequence
    const [existing] = await pool.execute(
      `SELECT id FROM partner_enrollments
       WHERE prospect_id = ? AND sequence_id = ? AND status IN ('active', 'waiting_partner')`,
      [prospect_id, sequence_id]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Prospect already enrolled in this partner sequence' });

    const [result] = await pool.execute(
      `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, current_step, status)
       VALUES (?, ?, ?, ?, 1, 'active')`,
      [prospect_id, sequence_id, seq.agent_id, seq.partner_agent_id]
    );

    res.status(201).json({ id: result.insertId, message: 'Prospect enrolled in partner sequence' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /enroll-bulk - enroll multiple prospects
router.post('/enroll-bulk', async (req, res) => {
  try {
    const { prospect_ids, sequence_id } = req.body;
    if (!prospect_ids?.length || !sequence_id) {
      return res.status(400).json({ error: 'prospect_ids array and sequence_id are required' });
    }

    const [seqs] = await pool.execute('SELECT * FROM partner_sequences WHERE id = ?', [sequence_id]);
    if (seqs.length === 0) return res.status(404).json({ error: 'Partner sequence not found' });
    const seq = seqs[0];

    let enrolled = 0;
    for (const pid of prospect_ids) {
      const [existing] = await pool.execute(
        `SELECT id FROM partner_enrollments
         WHERE prospect_id = ? AND sequence_id = ? AND status IN ('active', 'waiting_partner')`,
        [pid, sequence_id]
      );
      if (existing.length > 0) continue;

      await pool.execute(
        `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, current_step, status)
         VALUES (?, ?, ?, ?, 1, 'active')`,
        [pid, sequence_id, seq.agent_id, seq.partner_agent_id]
      );
      enrolled++;
    }

    res.json({ message: `Enrolled ${enrolled} prospect(s)`, enrolled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /import - import from Apollo and auto-enroll in partner sequence
router.post('/import', async (req, res) => {
  try {
    const { prospects, sequence_id } = req.body;
    if (!Array.isArray(prospects) || prospects.length === 0 || !sequence_id) {
      return res.status(400).json({ error: 'prospects array and sequence_id are required' });
    }

    // Get the sequence for agent/partner IDs
    const [seqs] = await pool.execute('SELECT * FROM partner_sequences WHERE id = ?', [sequence_id]);
    if (seqs.length === 0) return res.status(404).json({ error: 'Partner sequence not found' });
    const seq = seqs[0];

    let imported = 0;
    let duplicates = 0;
    let enrolled = 0;

    for (const p of prospects) {
      if (!p.email) continue;

      // Dedup check
      const [existing] = await pool.execute('SELECT id FROM prospects WHERE email = ?', [p.email]);

      let prospectId;
      if (existing.length > 0) {
        prospectId = existing[0].id;
        duplicates++;
      } else {
        // Insert new prospect with source = 'partner'
        const [result] = await pool.execute(
          `INSERT INTO prospects (first_name, last_name, email, company, title, industry, phone, linkedin_url, source, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'partner', 'in_sequence')`,
          [
            p.first_name || null, p.last_name || null, p.email,
            p.organization_name || p.organization?.name || p.company || null,
            p.title || null,
            p.industry || null,
            p.phone_numbers?.[0]?.sanitized_number || p.phone || null,
            p.linkedin_url || null,
          ]
        );
        prospectId = result.insertId;
        imported++;
      }

      // Check not already enrolled
      const [existingEnroll] = await pool.execute(
        `SELECT id FROM partner_enrollments
         WHERE prospect_id = ? AND sequence_id = ? AND status IN ('active', 'waiting_partner')`,
        [prospectId, sequence_id]
      );

      if (existingEnroll.length === 0) {
        await pool.execute(
          `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, current_step, status)
           VALUES (?, ?, ?, ?, 1, 'active')`,
          [prospectId, sequence_id, seq.agent_id, seq.partner_agent_id]
        );
        enrolled++;
      }
    }

    res.json({ imported, duplicates, enrolled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /search-apollo - search Apollo (proxy for partner page)
router.post('/search-apollo', async (req, res) => {
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      // Try from settings table
      const [[settings]] = await pool.query("SELECT value FROM settings WHERE `key` = 'apollo_api_key'");
      if (!settings) return res.status(400).json({ error: 'Apollo API key not configured' });
    }

    const key = apiKey || (await pool.query("SELECT value FROM settings WHERE `key` = 'apollo_api_key'"))[0][0]?.value;

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /enrollments/:id/cancel - cancel an enrollment
router.put('/enrollments/:id/cancel', async (req, res) => {
  try {
    await pool.execute(
      `UPDATE partner_enrollments SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Enrollment cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
