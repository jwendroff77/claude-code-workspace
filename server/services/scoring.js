import pool from '../db/connection.js';

// Calculate intent score for a prospect based on engagement signals
export async function calculateIntentScore(prospectId) {
  let score = 0;

  // Email opens: +5 per open, max 25
  const [[{ totalOpens }]] = await pool.execute(
    'SELECT COALESCE(SUM(open_count), 0) AS totalOpens FROM sent_emails WHERE prospect_id = ?',
    [prospectId]
  );
  score += Math.min(totalOpens * 5, 25);

  // Link clicks: +15 per click, max 45
  const [[{ totalClicks }]] = await pool.execute(
    'SELECT COALESCE(SUM(click_count), 0) AS totalClicks FROM sent_emails WHERE prospect_id = ?',
    [prospectId]
  );
  score += Math.min(totalClicks * 15, 45);

  // Reply sentiment scoring
  const [replies] = await pool.execute(
    'SELECT sentiment FROM received_emails WHERE prospect_id = ?',
    [prospectId]
  );

  for (const reply of replies) {
    switch (reply.sentiment) {
      case 'positive': score += 30; break;
      case 'meeting_request': score += 25; break;
      case 'question': score += 25; break;
      case 'referral': score += 20; break;
      case 'neutral': score += 10; break;
      case 'not_now': score += 0; break;
      case 'negative': score -= 20; break;
      case 'ooo': score += 0; break;
    }
  }

  // Multiple opens bonus (3+ opens on any single email)
  const [[{ multiOpenEmails }]] = await pool.execute(
    'SELECT COUNT(*) AS multiOpenEmails FROM sent_emails WHERE prospect_id = ? AND open_count >= 3',
    [prospectId]
  );
  if (multiOpenEmails > 0) score += 10;

  // Recent activity bonus (any engagement in last 48h)
  const [[{ recentActivity }]] = await pool.execute(
    `SELECT COUNT(*) AS recentActivity FROM (
       SELECT id FROM sent_emails WHERE prospect_id = ? AND opened_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
       UNION ALL
       SELECT id FROM received_emails WHERE prospect_id = ? AND received_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
     ) t`,
    [prospectId, prospectId]
  );
  if (recentActivity > 0) score += 10;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Update prospect
  await pool.execute(
    'UPDATE prospects SET intent_score = ?, intent_updated_at = NOW() WHERE id = ?',
    [score, prospectId]
  );

  return score;
}

// Recalculate scores for all active prospects
export async function recalculateAllScores() {
  const [prospects] = await pool.execute(
    "SELECT id FROM prospects WHERE status IN ('in_sequence', 'replied', 'engaged')"
  );

  let updated = 0;
  for (const p of prospects) {
    await calculateIntentScore(p.id);
    updated++;
  }

  return updated;
}
