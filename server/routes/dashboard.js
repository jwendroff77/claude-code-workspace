import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET /metrics - aggregate metrics
router.get('/metrics', async (req, res) => {
  try {
    const [[{ appointments }]] = await pool.query(
      "SELECT COUNT(*) AS appointments FROM prospects WHERE status = 'appointment_set'"
    );

    const [[{ emailsToday }]] = await pool.query(
      'SELECT COUNT(*) AS emailsToday FROM sent_emails WHERE DATE(sent_at) = CURDATE()'
    );

    const [[{ totalSent }]] = await pool.query(
      'SELECT COUNT(*) AS totalSent FROM sent_emails WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );

    const [[{ totalReplies }]] = await pool.query(
      'SELECT COUNT(*) AS totalReplies FROM received_emails WHERE received_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );

    const replyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : 0;

    const [[{ inSequence }]] = await pool.query(
      "SELECT COUNT(*) AS inSequence FROM enrollments WHERE status = 'active'"
    );

    res.json({
      appointmentsBooked: appointments,
      emailsSentToday: emailsToday,
      replyRate: parseFloat(replyRate),
      prospectsInSequence: inSequence
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /agents - agent performance summary for dashboard cards
router.get('/agents', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        a.id, a.name, a.status,
        COUNT(DISTINCT e.prospect_id) AS active_prospects,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND DATE(se.sent_at) = CURDATE()) AS sent_today,
        (SELECT COUNT(*) FROM sent_emails se WHERE se.agent_id = a.id AND se.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS sent_7d,
        (SELECT COUNT(*) FROM received_emails re WHERE re.agent_id = a.id AND re.received_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS replies_7d,
        (SELECT COUNT(*) FROM received_emails re WHERE re.agent_id = a.id AND re.actioned = 0) AS unactioned_replies
       FROM agents a
       LEFT JOIN enrollments e ON e.agent_id = a.id AND e.status = 'active'
       GROUP BY a.id
       ORDER BY a.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /attention - attention feed items
router.get('/attention', async (req, res) => {
  try {
    const items = [];

    // Unactioned positive/interested replies
    const [hotReplies] = await pool.query(
      `SELECT r.id, r.subject, r.sentiment, r.received_at,
              p.first_name, p.last_name, p.company,
              a.name AS agent_name,
              'hot_reply' AS attention_type
       FROM received_emails r
       JOIN prospects p ON r.prospect_id = p.id
       JOIN agents a ON r.agent_id = a.id
       WHERE r.actioned = 0 AND r.sentiment IN ('positive', 'interested')
       ORDER BY r.received_at DESC
       LIMIT 10`
    );
    items.push(...hotReplies);

    // Bounced or failed emails
    const [failedEmails] = await pool.query(
      `SELECT se.id, se.subject, se.status, se.sent_at,
              p.first_name, p.last_name, p.company,
              a.name AS agent_name,
              'send_failure' AS attention_type
       FROM sent_emails se
       JOIN prospects p ON se.prospect_id = p.id
       JOIN agents a ON se.agent_id = a.id
       WHERE se.status IN ('bounced', 'failed')
       AND se.sent_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
       ORDER BY se.sent_at DESC
       LIMIT 10`
    );
    items.push(...failedEmails);

    // Agents below queue threshold
    const [lowQueue] = await pool.query(
      `SELECT a.id, a.name, a.queue_threshold,
              COUNT(e.id) AS active_count,
              'low_queue' AS attention_type
       FROM agents a
       LEFT JOIN enrollments e ON e.agent_id = a.id AND e.status = 'active'
       WHERE a.status = 'active' AND a.queue_threshold > 0
       GROUP BY a.id
       HAVING active_count < a.queue_threshold`
    );
    items.push(...lowQueue);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
