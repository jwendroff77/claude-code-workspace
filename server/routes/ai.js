import { Router } from 'express';
import pool from '../db/connection.js';
import { generateSequence as aiGenerateSequence, classifyReply } from '../services/ai.js';
import { checkDomainHealth } from '../services/domain.js';

const router = Router();

// POST /rewrite - generate AI rewrite for a sequence step
router.post('/rewrite', async (req, res) => {
  try {
    const { stepId, agentId } = req.body;

    if (!stepId || !agentId) {
      return res.status(400).json({ error: 'stepId and agentId are required' });
    }

    const [steps] = await pool.execute('SELECT * FROM sequence_steps WHERE id = ?', [stepId]);
    if (steps.length === 0) return res.status(404).json({ error: 'Step not found' });

    const [agents] = await pool.execute('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (agents.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const step = steps[0];
    const agent = agents[0];

    const [[settings]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'openai_api_key'"
    );
    if (!settings) return res.status(400).json({ error: 'OpenAI API key not configured' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a sales email copywriter. Write in the voice/persona of: ${agent.persona_voice || agent.name}. Keep emails concise and professional.`
          },
          {
            role: 'user',
            content: `Rewrite this sales email step.\n\nSubject: ${step.subject_template}\n\nBody:\n${step.body_template}\n\nReturn JSON with "subject" and "body" fields.`
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let rewrite;
    try {
      rewrite = JSON.parse(content);
    } catch {
      rewrite = { subject: step.subject_template, body: content };
    }

    res.json({
      original: { subject: step.subject_template, body: step.body_template },
      rewrite
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sentiment - analyze reply sentiment
router.post('/sentiment', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const [[settings]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'openai_api_key'"
    );
    if (!settings) return res.status(400).json({ error: 'OpenAI API key not configured' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Analyze the sentiment of this sales reply email. Return JSON with: "sentiment" (positive, negative, neutral, interested, not_interested, out_of_office), "confidence" (0-1), "summary" (one sentence).'
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      analysis = { sentiment: 'neutral', confidence: 0, summary: content };
    }

    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /coaching/:stepId - get coaching notes for a step
router.get('/coaching/:stepId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM coaching_notes WHERE step_id = ? ORDER BY created_at DESC',
      [req.params.stepId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /coaching/:stepId - add coaching note
router.post('/coaching/:stepId', async (req, res) => {
  try {
    const { note, source } = req.body;
    if (!note) return res.status(400).json({ error: 'note is required' });

    const [result] = await pool.execute(
      'INSERT INTO coaching_notes (step_id, note, source) VALUES (?, ?, ?)',
      [req.params.stepId, note, source || 'manual']
    );

    const [rows] = await pool.query('SELECT * FROM coaching_notes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /generate-sequence - AI generates a full sequence
router.post('/generate-sequence', async (req, res) => {
  try {
    const { vertical, agent_id, num_steps } = req.body;
    if (!vertical || !agent_id) return res.status(400).json({ error: 'vertical and agent_id required' });

    const [agents] = await pool.execute('SELECT * FROM agents WHERE id = ?', [agent_id]);
    if (agents.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const steps = await aiGenerateSequence({
      vertical,
      agent: agents[0],
      numSteps: num_steps || 5,
    });

    if (!steps) return res.status(500).json({ error: 'AI generation failed' });

    res.json({ steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /classify - classify a reply using smart classification
router.post('/classify', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await classifyReply(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /domain-health - check domain health
router.get('/domain-health', async (req, res) => {
  try {
    const domain = req.query.domain || '1cloudnow.com';

    // Return cached result if checked in last hour
    const [cached] = await pool.execute(
      'SELECT * FROM domain_health WHERE domain = ? AND last_checked >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
      [domain]
    );
    if (cached.length > 0) {
      return res.json(cached[0]);
    }

    const result = await checkDomainHealth(domain);
    const [rows] = await pool.execute('SELECT * FROM domain_health WHERE domain = ?', [domain]);
    res.json(rows.length > 0 ? rows[0] : result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /domain-health/check - force re-check
router.post('/domain-health/check', async (req, res) => {
  try {
    const domain = req.body.domain || '1cloudnow.com';
    const result = await checkDomainHealth(domain);
    const [rows] = await pool.execute('SELECT * FROM domain_health WHERE domain = ?', [domain]);
    res.json(rows.length > 0 ? rows[0] : result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /rotation-recommendation - check if any agents should be rotated
router.get('/rotation-recommendation', async (req, res) => {
  try {
    const [agents] = await pool.query(`
      SELECT
        a.id, a.name,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND se.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS sent_7d,
        (SELECT COUNT(*) FROM received_emails re WHERE re.agent_id = a.id AND re.received_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS replies_7d
      FROM agents a
      WHERE a.role = 'outbound' AND a.status = 'active'
    `);

    const withRates = agents.map(a => ({
      ...a,
      reply_rate: a.sent_7d > 0 ? ((a.replies_7d / a.sent_7d) * 100) : 0,
    }));

    const avgRate = withRates.reduce((sum, a) => sum + a.reply_rate, 0) / Math.max(withRates.length, 1);

    const recommendations = withRates
      .filter(a => a.sent_7d >= 100 && a.reply_rate < avgRate * 0.5)
      .map(a => ({
        agent_id: a.id,
        agent_name: a.name,
        reply_rate: a.reply_rate.toFixed(1),
        team_avg: avgRate.toFixed(1),
        message: `${a.name}'s reply rate is ${a.reply_rate.toFixed(1)}% vs team avg ${avgRate.toFixed(1)}%. Consider rotating prospects to a higher performer.`,
      }));

    res.json({ recommendations, agents: withRates, team_avg: avgRate.toFixed(1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rotate - move prospects from one agent to another
router.post('/rotate', async (req, res) => {
  try {
    const { from_agent_id, to_agent_id, max_count } = req.body;
    if (!from_agent_id || !to_agent_id) return res.status(400).json({ error: 'from_agent_id and to_agent_id required' });

    const limit = Math.min(max_count || 50, 50);

    // Move active enrollments
    const [result] = await pool.execute(
      `UPDATE prospect_sequence_enrollment SET agent_id = ?
       WHERE agent_id = ? AND status = 'active'
       LIMIT ${limit}`,
      [to_agent_id, from_agent_id]
    );

    // Update prospect assignments
    await pool.execute(
      `UPDATE prospects SET assigned_agent_id = ?
       WHERE assigned_agent_id = ? AND status = 'in_sequence'
       LIMIT ${limit}`,
      [to_agent_id, from_agent_id]
    );

    res.json({ message: `Rotated ${result.affectedRows} prospects`, moved: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
