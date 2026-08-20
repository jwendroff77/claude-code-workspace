import { Router } from 'express';
import pool from '../db/connection.js';
import { runFullScan } from '../services/signalIntel.js';

const router = Router();

// GET / - list leads with filters
router.get('/', async (req, res) => {
  try {
    const { status, trigger_type, min_score, search, page = 1, per_page = 50 } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (trigger_type) {
      conditions.push('trigger_type = ?');
      params.push(trigger_type);
    }
    if (min_score) {
      conditions.push('score >= ?');
      params.push(parseInt(min_score, 10));
    }
    if (search) {
      conditions.push('(company LIKE ? OR contact_name LIKE ? OR contact_email LIKE ? OR trigger_headline LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page, 10) - 1) * parseInt(per_page, 10);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM signal_intel_leads ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT * FROM signal_intel_leads ${where} ORDER BY score DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(per_page, 10), offset]
    );

    res.json({ leads: rows, total, page: parseInt(page, 10), per_page: parseInt(per_page, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - counts by status, trigger type, score ranges
router.get('/stats', async (req, res) => {
  try {
    const [[counts]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'new') AS new_count,
        SUM(status = 'reviewed') AS reviewed,
        SUM(status = 'enrolled') AS enrolled,
        SUM(status = 'dismissed') AS dismissed,
        SUM(score >= 85) AS hot,
        SUM(score >= 65 AND score < 85) AS warm,
        SUM(score < 65) AS cool
      FROM signal_intel_leads
    `);

    const [byTrigger] = await pool.query(`
      SELECT trigger_type, COUNT(*) AS count
      FROM signal_intel_leads
      GROUP BY trigger_type
    `);

    // Last scan time — most recent created_at
    const [[lastScan]] = await pool.query(
      'SELECT MAX(created_at) AS last_scan FROM signal_intel_leads'
    );

    res.json({
      total: counts.total || 0,
      new: counts.new_count || 0,
      reviewed: counts.reviewed || 0,
      enrolled: counts.enrolled || 0,
      dismissed: counts.dismissed || 0,
      hot: counts.hot || 0,
      warm: counts.warm || 0,
      cool: counts.cool || 0,
      byTrigger: byTrigger || [],
      lastScan: lastScan?.last_scan || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /scan - trigger manual scan
router.post('/scan', async (req, res) => {
  try {
    const { limit = 300 } = req.body || {};
    const result = await runFullScan({ limit });
    res.json(result);
  } catch (err) {
    console.error('[Signal Intel] Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/dismiss - dismiss a lead
router.put('/:id/dismiss', async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE signal_intel_leads SET status = 'dismissed' WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/enroll - enroll lead into a sequence (creates prospect + enrollment)
router.put('/:id/enroll', async (req, res) => {
  try {
    const [leads] = await pool.execute('SELECT * FROM signal_intel_leads WHERE id = ?', [req.params.id]);
    if (leads.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const lead = leads[0];
    if (!lead.contact_email) return res.status(400).json({ error: 'Lead has no contact email' });

    // Check for existing prospect with this email
    const [existing] = await pool.execute('SELECT id FROM prospects WHERE email = ?', [lead.contact_email]);
    if (existing.length > 0) {
      // Update the lead to point to existing prospect
      await pool.execute(
        "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
        [existing[0].id, lead.id]
      );
      return res.json({ success: true, prospect_id: existing[0].id, message: 'Prospect already exists, lead marked as enrolled' });
    }

    // Parse contact name
    const nameParts = (lead.contact_name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Build notes with trigger context for AI opener
    const triggerNote = `SIGNAL INTEL -- Trigger: ${lead.trigger_type} | ${(lead.trigger_headline || '').slice(0, 150)} | Source: ${lead.trigger_source || ''} | URL: ${lead.trigger_url || ''} | Score: ${lead.score}`;

    // Create prospect
    const [result] = await pool.execute(
      `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, company_size, industry, city, state, apollo_id, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence')`,
      [
        firstName, lastName, lead.contact_email,
        lead.company || null, lead.contact_title || null,
        lead.contact_phone || null, lead.contact_linkedin || null,
        lead.employee_count || null, lead.industry || null,
        lead.city || null, lead.state || null,
        lead.apollo_id || null, `signal-intel: ${triggerNote}`,
      ]
    );

    const prospectId = result.insertId;

    // Round-robin assign to agents, and enroll each prospect in THAT agent's OWN sequence.
    // Each agent has a sequence whose name starts with their first name (e.g. "Scott - Enterprise Narrative").
    // Bug fixed 2026-06-17: previously always enrolled in the first sequence (Megan's), so Lauren/Kate/Scott
    // sent Megan-signed emails. Match the sequence to the sending agent so the signature is correct.
    const [agents] = await pool.query("SELECT id, name FROM agents WHERE status = 'active' AND role = 'outbound' ORDER BY id");
    const [seqs] = await pool.query("SELECT id, name FROM sequences WHERE status = 'active' ORDER BY id");

    if (agents.length > 0 && seqs.length > 0) {
      // Assign agent round-robin based on prospect ID
      const agent = agents[prospectId % agents.length];
      const agentId = agent.id;

      // Pick the agent's own sequence (name starts with their first name); fall back to first sequence.
      const agentFirst = (agent.name || '').split(' ')[0].toLowerCase();
      const ownSeq = seqs.find(s => (s.name || '').toLowerCase().startsWith(agentFirst));
      const sequenceId = ownSeq ? ownSeq.id : seqs[0].id;

      await pool.execute(
        'UPDATE prospects SET assigned_agent_id = ? WHERE id = ?',
        [agentId, prospectId]
      );

      await pool.execute(
        `INSERT INTO prospect_sequence_enrollment (prospect_id, sequence_id, agent_id, current_step, status)
         VALUES (?, ?, ?, 1, 'active')`,
        [prospectId, sequenceId, agentId]
      );
    }

    // Update signal intel lead status
    await pool.execute(
      "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
      [prospectId, lead.id]
    );

    // Log pipeline event
    await pool.execute(
      "INSERT INTO pipeline_events (prospect_id, old_status, new_status, changed_by) VALUES (?, 'new', 'in_sequence', 'signal_intel')",
      [prospectId]
    );

    res.json({ success: true, prospect_id: prospectId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/enroll-partner - enroll into partner cadence with Jared
router.put('/:id/enroll-partner', async (req, res) => {
  try {
    const [leads] = await pool.execute('SELECT * FROM signal_intel_leads WHERE id = ?', [req.params.id]);
    if (leads.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const lead = leads[0];
    if (!lead.contact_email) return res.status(400).json({ error: 'Lead has no contact email' });

    // Check for existing prospect
    const [existing] = await pool.execute('SELECT id FROM prospects WHERE email = ?', [lead.contact_email]);
    let prospectId;

    if (existing.length > 0) {
      prospectId = existing[0].id;
    } else {
      const nameParts = (lead.contact_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const triggerNote = `SIGNAL INTEL -- Trigger: ${lead.trigger_type} | ${(lead.trigger_headline || '').slice(0, 150)} | Source: ${lead.trigger_source || ''} | Score: ${lead.score}`;

      const [result] = await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, company_size, industry, city, state, apollo_id, source, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence')`,
        [
          firstName, lastName, lead.contact_email,
          lead.company || null, lead.contact_title || null,
          lead.contact_phone || null, lead.contact_linkedin || null,
          lead.employee_count || null, lead.industry || null,
          lead.city || null, lead.state || null,
          lead.apollo_id || null, `signal-intel-partner: ${triggerNote}`,
        ]
      );
      prospectId = result.insertId;
    }

    // Find partner sequence — caller picks which partner (Jared/Ed/Chad) via sequence_id;
    // falls back to "first active" only if none was specified (back-compat).
    const { sequence_id } = req.body;
    let seq;
    if (sequence_id) {
      const [rows] = await pool.execute(
        "SELECT id, agent_id, partner_agent_id FROM partner_sequences WHERE id = ? AND status = 'active'",
        [sequence_id]
      );
      if (rows.length === 0) return res.status(400).json({ error: 'Partner sequence not found or inactive' });
      seq = rows[0];
    } else {
      const [rows] = await pool.query(
        "SELECT id, agent_id, partner_agent_id FROM partner_sequences WHERE status = 'active' LIMIT 1"
      );
      if (rows.length === 0) return res.status(400).json({ error: 'No active partner sequence found' });
      seq = rows[0];
    }

    // Enroll as PAUSED - partner cadence sends are manual only via /api/partner-cadence/send-next
    await pool.execute(
      `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, status, current_step)
       VALUES (?, ?, ?, ?, 'paused', 1)`,
      [prospectId, seq.id, seq.agent_id, seq.partner_agent_id]
    );

    // Update signal intel lead
    await pool.execute(
      "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
      [prospectId, lead.id]
    );

    res.json({ success: true, prospect_id: prospectId, partner: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
