import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db/connection.js';

const router = Router();

const SECRET = process.env.JWT_SECRET || 'onecloud2026';

// Generate a signed unsubscribe token for a prospect
export function generateUnsubToken(prospectId, email) {
  const data = `${prospectId}:${email}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 16);
  // Base64 encode the data + hmac
  return Buffer.from(`${prospectId}:${hmac}`).toString('base64url');
}

// Verify and decode an unsubscribe token
function decodeUnsubToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [prospectId, hmac] = decoded.split(':');
    return { prospectId: parseInt(prospectId), hmac };
  } catch {
    return null;
  }
}

function verifyToken(prospectId, email, hmac) {
  const data = `${prospectId}:${email}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 16);
  return hmac === expected;
}

// GET /unsubscribe/:token — public endpoint, no auth required
// Shows a simple confirmation page and processes the unsubscribe
router.get('/:token', async (req, res) => {
  try {
    const parsed = decodeUnsubToken(req.params.token);
    if (!parsed) {
      return res.status(400).send(unsubPage('Invalid Link', 'This unsubscribe link is not valid.', false));
    }

    // Get the prospect
    const [prospects] = await pool.execute('SELECT * FROM prospects WHERE id = ?', [parsed.prospectId]);
    if (prospects.length === 0) {
      return res.status(404).send(unsubPage('Not Found', 'This contact was not found in our system.', false));
    }

    const prospect = prospects[0];

    // Verify token
    if (!verifyToken(parsed.prospectId, prospect.email, parsed.hmac)) {
      return res.status(400).send(unsubPage('Invalid Link', 'This unsubscribe link is not valid.', false));
    }

    // Already unsubscribed?
    if (prospect.status === 'unsubscribed') {
      return res.send(unsubPage('Already Unsubscribed', `${prospect.email} has already been removed from our mailing list.`, true));
    }

    // Process the unsubscribe
    await pool.execute(
      "UPDATE prospects SET status = 'unsubscribed', updated_at = NOW() WHERE id = ?",
      [parsed.prospectId]
    );

    // Cancel all active sequences
    await pool.execute(
      `UPDATE prospect_sequence_enrollment SET status = 'cancelled'
       WHERE prospect_id = ? AND status IN ('active', 'paused')`,
      [parsed.prospectId]
    );

    // Cancel any partner enrollments
    await pool.execute(
      `UPDATE partner_enrollments SET status = 'cancelled'
       WHERE prospect_id = ? AND status IN ('active', 'waiting_partner')`,
      [parsed.prospectId]
    );

    // Add to exclusion list
    await pool.execute(
      `INSERT INTO exclusion_list (email, company, reason, created_at)
       SELECT ?, ?, 'Unsubscribed via email link', NOW()
       FROM dual WHERE NOT EXISTS (SELECT 1 FROM exclusion_list WHERE email = ?)`,
      [prospect.email, prospect.company, prospect.email]
    );

    // Log pipeline event
    await pool.execute(
      `INSERT INTO pipeline_events (prospect_id, from_status, to_status, notes)
       VALUES (?, ?, 'unsubscribed', 'Prospect clicked unsubscribe link')`,
      [parsed.prospectId, prospect.status]
    );

    return res.send(unsubPage(
      'Unsubscribed',
      `${prospect.email} has been removed from all future communications from 1Cloud Communications.`,
      true
    ));
  } catch (err) {
    console.error('[Unsubscribe] Error:', err.message);
    return res.status(500).send(unsubPage('Error', 'Something went wrong.  Please contact us directly to unsubscribe.', false));
  }
});

// Simple HTML page for unsubscribe confirmation
function unsubPage(title, message, success) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - 1Cloud Communications</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; }
    .container { max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: ${success ? '#1B3A4B' : '#c0392b'}; font-size: 24px; margin-bottom: 16px; }
    p { color: #555; font-size: 16px; line-height: 1.5; }
    .logo { font-size: 20px; font-weight: bold; color: #1B3A4B; margin-bottom: 24px; }
    .check { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">1Cloud Communications</div>
    <div class="check">${success ? '&#10003;' : '&#10007;'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export default router;
