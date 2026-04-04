import { Router } from 'express';
import pool from '../db/connection.js';

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

export default router;
