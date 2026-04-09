import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET /funnel - Sent > Opened > Clicked > Replied > Booked
router.get('/funnel', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const agentId = req.query.agent_id;
    const agentFilter = agentId ? 'AND agent_id = ?' : '';
    const params = agentId ? [days, agentId] : [days];

    const [[{ sent }]] = await pool.execute(
      `SELECT COUNT(*) AS sent FROM sent_emails WHERE sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${agentFilter}`,
      params
    );

    const [[{ opened }]] = await pool.execute(
      `SELECT COUNT(*) AS opened FROM sent_emails WHERE opened_at IS NOT NULL AND sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${agentFilter}`,
      params
    );

    const [[{ clicked }]] = await pool.execute(
      `SELECT COUNT(*) AS clicked FROM sent_emails WHERE click_count > 0 AND sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${agentFilter}`,
      params
    );

    const replyParams = agentId ? [days, agentId] : [days];
    const [[{ replied }]] = await pool.execute(
      `SELECT COUNT(DISTINCT prospect_id) AS replied FROM received_emails WHERE received_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${agentFilter}`,
      replyParams
    );

    const bookParams = agentId ? [days, agentId] : [days];
    const [[{ booked }]] = await pool.execute(
      `SELECT COUNT(*) AS booked FROM pipeline_events WHERE to_status = 'booked' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${agentId ? 'AND agent_id = ?' : ''}`,
      bookParams
    );

    res.json({ sent, opened, clicked, replied, booked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /agents - Per-agent performance
router.get('/agents', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [rows] = await pool.query(`
      SELECT
        a.id, a.name, a.status,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS sent,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND se.opened_at IS NOT NULL AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS opened,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND se.click_count > 0 AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS clicked,
        (SELECT COUNT(*) FROM received_emails re WHERE re.agent_id = a.id AND re.received_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS replies,
        (SELECT COUNT(*) FROM received_emails re WHERE re.agent_id = a.id AND re.sentiment = 'positive' AND re.received_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS positive_replies,
        (SELECT COUNT(*) FROM pipeline_events pe WHERE pe.agent_id = a.id AND pe.to_status = 'booked' AND pe.created_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS booked
      FROM agents a
      WHERE a.role = 'outbound'
      ORDER BY a.name
    `);

    const enriched = rows.map(r => ({
      ...r,
      open_rate: r.sent > 0 ? ((r.opened / r.sent) * 100).toFixed(1) : '0.0',
      click_rate: r.sent > 0 ? ((r.clicked / r.sent) * 100).toFixed(1) : '0.0',
      reply_rate: r.sent > 0 ? ((r.replies / r.sent) * 100).toFixed(1) : '0.0',
      positive_rate: r.replies > 0 ? ((r.positive_replies / r.replies) * 100).toFixed(1) : '0.0',
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sequences - Per-sequence step-level metrics
router.get('/sequences', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [rows] = await pool.query(`
      SELECT
        s.id AS sequence_id, s.name AS sequence_name,
        ss.id AS step_id, ss.step_number, ss.subject_line,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.sequence_step_id = ss.id AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS sent,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.sequence_step_id = ss.id AND se.opened_at IS NOT NULL AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS opened,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.sequence_step_id = ss.id AND se.click_count > 0 AND se.sent_at >= DATE_SUB(NOW(), INTERVAL ${pool.escape(days)} DAY)) AS clicked
      FROM sequences s
      JOIN sequence_steps ss ON ss.sequence_id = s.id
      WHERE s.status = 'active'
      ORDER BY s.name, ss.step_number
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /trends - Daily counts for chart
router.get('/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [rows] = await pool.query(`
      SELECT
        DATE(d.date) AS date,
        COALESCE(s.sent, 0) AS sent,
        COALESCE(o.opened, 0) AS opened,
        COALESCE(r.replied, 0) AS replied
      FROM (
        SELECT DATE_SUB(CURDATE(), INTERVAL n DAY) AS date
        FROM (SELECT @rownum := @rownum + 1 AS n FROM sent_emails, (SELECT @rownum := -1) t LIMIT ${pool.escape(days)}) nums
      ) d
      LEFT JOIN (
        SELECT DATE(sent_at) AS dt, COUNT(*) AS sent FROM sent_emails GROUP BY dt
      ) s ON s.dt = d.date
      LEFT JOIN (
        SELECT DATE(opened_at) AS dt, COUNT(*) AS opened FROM sent_emails WHERE opened_at IS NOT NULL GROUP BY dt
      ) o ON o.dt = d.date
      LEFT JOIN (
        SELECT DATE(received_at) AS dt, COUNT(*) AS replied FROM received_emails GROUP BY dt
      ) r ON r.dt = d.date
      ORDER BY d.date
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
