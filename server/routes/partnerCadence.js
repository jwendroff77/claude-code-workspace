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

// GET /send-status - Check how many are pending, sent, waiting for Jared
router.get('/send-status', async (req, res) => {
  try {
    const [[{ paused }]] = await pool.query("SELECT COUNT(*) AS paused FROM partner_enrollments WHERE status = 'paused' AND current_step = 1");
    const [[{ waiting_partner }]] = await pool.query("SELECT COUNT(*) AS waiting_partner FROM partner_enrollments WHERE status = 'waiting_partner'");
    const [[{ active }]] = await pool.query("SELECT COUNT(*) AS active FROM partner_enrollments WHERE status = 'active' AND current_step > 2");
    const [[{ completed }]] = await pool.query("SELECT COUNT(*) AS completed FROM partner_enrollments WHERE status = 'completed'");
    const [[{ cancelled }]] = await pool.query("SELECT COUNT(*) AS cancelled FROM partner_enrollments WHERE status = 'cancelled'");
    res.json({ ready_to_send: paused, waiting_for_jared: waiting_partner, in_followup: active, completed, cancelled });
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

// POST /send-next - Send exactly ONE partner cadence email (Step 1)
// Manual control only. Returns the email details so you can review before sending the next.
import { sendMail, getLastSentTo, replyToMessage } from '../services/graph.js';
import { generatePersonalizedOpener } from '../services/ai.js';

router.post('/send-next', async (req, res) => {
  const { bcc } = req.body || {};
  try {
    // Get exactly 1 paused enrollment at step 1
    // Priority order:
    // 1. Signal Intel leads (warm - have trigger event context) - highest score first
    // 2. Cold prospects (oldest enrollment first)
    const [enrollments] = await pool.query(
      `SELECT pe.id AS enroll_id, pe.prospect_id, pe.sequence_id, pe.agent_id, pe.partner_agent_id,
              p.email, p.first_name, p.last_name, p.company, p.industry, p.city, p.state, p.title AS prospect_title,
              p.source,
              a.name AS agent_name, a.smtp_user, a.email AS agent_email, a.persona_voice,
              pa.email AS partner_email, pa.name AS partner_name,
              CASE WHEN p.source LIKE '%signal-intel%' THEN 1 ELSE 0 END AS is_signal_intel,
              COALESCE(
                (SELECT score FROM signal_intel_leads sil WHERE sil.enrolled_prospect_id = p.id LIMIT 1),
                0
              ) AS signal_score
       FROM partner_enrollments pe
       JOIN prospects p ON p.id = pe.prospect_id
       JOIN agents a ON a.id = pe.agent_id
       JOIN agents pa ON pa.id = pe.partner_agent_id
       WHERE pe.status = 'paused' AND pe.current_step = 1
       ORDER BY is_signal_intel DESC, signal_score DESC, pe.enrolled_at ASC
       LIMIT 1`
    );

    if (enrollments.length === 0) {
      return res.json({ message: 'No more prospects to send', remaining: 0 });
    }

    const e = enrollments[0];
    const fromEmail = e.smtp_user || e.agent_email;

    // Get Step 1 template
    const [steps] = await pool.execute(
      'SELECT * FROM partner_sequence_steps WHERE sequence_id = ? AND step_number = 1',
      [e.sequence_id]
    );
    if (steps.length === 0) return res.status(400).json({ error: 'No Step 1 template found' });

    // Generate AI opener — HARD REQUIREMENT, no send without it
    let aiOpener = '';
    try {
      aiOpener = await generatePersonalizedOpener({
        prospect: e,
        agent: { name: e.agent_name, title: '', persona_voice: e.persona_voice || '' },
      });
      if (!aiOpener || aiOpener.length < 10) {
        throw new Error('AI opener too short or empty');
      }
      await pool.execute('UPDATE prospects SET personalized_opener = ? WHERE id = ?', [aiOpener, e.prospect_id]);
    } catch (aiErr) {
      // Do NOT send without an AI opener. Return error so caller can retry later.
      console.log(`[PartnerSend] AI opener failed for ${e.email}: ${aiErr.message} - skipping send`);
      return res.status(503).json({
        error: 'AI opener generation failed - send skipped',
        detail: aiErr.message,
        prospect: `${e.first_name} ${e.last_name}`,
        company: e.company,
        should_retry: true,
      });
    }

    // Build email - replace tags, safety strip any remaining
    let body = (steps[0].body_html || '')
      .replace(/\{\{aiOpener\}\}/g, aiOpener)
      .replace(/\{\{firstName\}\}/g, e.first_name || '')
      .replace(/\{\{lastName\}\}/g, e.last_name || '')
      .replace(/\{\{company\}\}/g, e.company || '')
      .replace(/\{\{email\}\}/g, e.email || '')
      .replace(/\{\{[^}]+\}\}/g, ''); // SAFETY: strip anything left

    let subject = (steps[0].subject_line || 'Connecting you with {{company}}')
      .replace(/\{\{company\}\}/g, e.company || '')
      .replace(/\{\{[^}]+\}\}/g, '');

    // Send
    await sendMail({
      fromEmail,
      to: e.email,
      cc: e.partner_email,
      bcc: bcc || undefined,
      subject,
      html: body,
    });

    // Log to sent_emails
    await pool.execute(
      'INSERT INTO sent_emails (prospect_id, agent_id, to_email, subject, body, ai_opener, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [e.prospect_id, e.agent_id, e.email, subject, body, aiOpener || null]
    );

    // Capture thread ID
    let threadCaptured = false;
    await new Promise(r => setTimeout(r, 6000));
    try {
      const lastSent = await getLastSentTo({ fromEmail, toEmail: e.email });
      if (lastSent) {
        await pool.execute(
          `UPDATE partner_enrollments SET current_step = 2, status = 'waiting_partner',
           conversation_id = ?, last_message_id = ?, updated_at = NOW() WHERE id = ?`,
          [lastSent.conversationId || null, lastSent.id, e.enroll_id]
        );
        threadCaptured = true;
      }
    } catch (threadErr) {
      // Advance anyway
      await pool.execute(
        "UPDATE partner_enrollments SET current_step = 2, status = 'waiting_partner', updated_at = NOW() WHERE id = ?",
        [e.enroll_id]
      );
    }

    // Count remaining
    const [[{ remaining }]] = await pool.query(
      "SELECT COUNT(*) AS remaining FROM partner_enrollments WHERE status = 'paused' AND current_step = 1"
    );

    res.json({
      sent: true,
      to: e.email,
      prospect: `${e.first_name} ${e.last_name}`,
      company: e.company,
      ai_opener: aiOpener,
      subject,
      thread_captured: threadCaptured,
      remaining,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /flush-followups - Bulk-send all overdue agent_followup steps for a given partner
// Use when follow-ups have fallen behind and need to catch up immediately.
// Body: { partner_agent_id: number, dry_run?: boolean }
router.post('/flush-followups', async (req, res) => {
  const { partner_agent_id, dry_run = false } = req.body;
  if (!partner_agent_id) return res.status(400).json({ error: 'partner_agent_id required' });

  try {
    const [enrollments] = await pool.query(
      `SELECT pe.*, p.email AS prospect_email, p.first_name, p.last_name, p.company,
              p.industry, p.city, p.state, p.title AS prospect_title,
              a.name AS agent_name, a.smtp_user AS agent_smtp_user, a.email AS agent_email,
              pa.name AS partner_name, pa.email AS partner_email,
              pss.body_html AS step_body, pss.subject_line AS step_subject, pss.delay_days
       FROM partner_enrollments pe
       JOIN prospects p ON p.id = pe.prospect_id
       JOIN agents a ON a.id = pe.agent_id
       JOIN agents pa ON pa.id = pe.partner_agent_id
       JOIN partner_sequences ps ON ps.id = pe.sequence_id
       JOIN partner_sequence_steps pss ON pss.sequence_id = pe.sequence_id AND pss.step_number = pe.current_step
       WHERE pe.partner_agent_id = ?
         AND pe.status = 'active'
         AND pss.step_type = 'agent_followup'
         AND pe.partner_replied_at IS NOT NULL
         AND TIMESTAMPDIFF(DAY, pe.partner_replied_at, NOW()) >= pss.delay_days
       ORDER BY pe.partner_replied_at ASC`,
      [partner_agent_id]
    );

    if (enrollments.length === 0) {
      return res.json({ message: 'No overdue follow-ups found', sent: 0 });
    }

    if (dry_run) {
      return res.json({
        dry_run: true,
        count: enrollments.length,
        prospects: enrollments.map(e => ({
          name: `${e.first_name} ${e.last_name}`,
          company: e.company,
          email: e.prospect_email,
          step: e.current_step,
          days_overdue: Math.floor((Date.now() - new Date(e.partner_replied_at).getTime()) / (1000 * 60 * 60 * 24)) - e.delay_days,
        })),
      });
    }

    const results = [];
    for (const e of enrollments) {
      try {
        const fromEmail = e.agent_smtp_user || e.agent_email;

        // Replace merge tags
        const body = (e.step_body || '')
          .replace(/\{\{firstName\}\}/g, e.first_name || '')
          .replace(/\{\{lastName\}\}/g, e.last_name || '')
          .replace(/\{\{company\}\}/g, e.company || '')
          .replace(/\{\{[^}]+\}\}/g, '');

        // Send in-thread if we have a message ID, otherwise standalone CC'ing partner
        let sendMethod = 'standalone';
        if (e.last_message_id) {
          try {
            await replyToMessage({ fromEmail, messageId: e.last_message_id, html: body });
            sendMethod = 'in-thread';
          } catch (replyErr) {
            console.log(`[FlushFollowups] Thread reply failed (${replyErr.message}), sending standalone CC partner`);
            const subject = `Re: ${e.partner_name} intro - ${e.company}`;
            await sendMail({ fromEmail, to: e.prospect_email, cc: e.partner_email, subject, html: body });
          }
        } else {
          const subject = `Re: ${e.partner_name} intro - ${e.company}`;
          await sendMail({ fromEmail, to: e.prospect_email, cc: e.partner_email, subject, html: body });
        }

        await pool.execute(
          `INSERT INTO sent_emails (prospect_id, agent_id, subject, body, sent_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [e.prospect_id, e.agent_id, `Partner cadence Step ${e.current_step}`, body]
        );

        // Capture new message ID for thread continuity — non-fatal if it fails
        await new Promise(r => setTimeout(r, 6000));
        let lastSentId = e.last_message_id;
        try {
          const lastSent = await getLastSentTo({ fromEmail, toEmail: e.prospect_email });
          if (lastSent?.id) lastSentId = lastSent.id;
        } catch (graphErr) {
          console.log(`[FlushFollowups] getLastSentTo failed (${graphErr.message}) - keeping existing message ID`);
        }

        await pool.execute(
          `UPDATE partner_enrollments SET current_step = ?, last_message_id = ?, updated_at = NOW() WHERE id = ?`,
          [e.current_step + 1, lastSentId, e.id]
        );

        console.log(`[FlushFollowups] Sent Step ${e.current_step} to ${e.first_name} ${e.last_name} (${e.company}) [${sendMethod}]`);
        results.push({ sent: true, prospect: `${e.first_name} ${e.last_name}`, company: e.company, step: e.current_step, method: sendMethod });

        // Random 3-4 min gap between sends — one email per rep per ~3-4 min
        if (enrollments.indexOf(e) < enrollments.length - 1) {
          const delay = (Math.random() * 60 + 180) * 1000; // 180-240s
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (err) {
        console.error(`[FlushFollowups] Failed for ${e.prospect_email}: ${err.message}`);
        results.push({ sent: false, prospect: `${e.first_name} ${e.last_name}`, company: e.company, error: err.message });
      }
    }

    res.json({ sent: results.filter(r => r.sent).length, failed: results.filter(r => !r.sent).length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
