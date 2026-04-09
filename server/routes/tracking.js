import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// 1x1 transparent GIF (43 bytes)
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// GET /open/:id - track email open via 1x1 pixel
router.get('/open/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) {
      return res.type('gif').set('Cache-Control', 'no-cache, no-store').send(PIXEL);
    }

    // Set opened_at on first open, always increment open_count
    await pool.execute(
      `UPDATE sent_emails
       SET opened_at = COALESCE(opened_at, NOW()),
           open_count = open_count + 1
       WHERE id = ?`,
      [id]
    );

    // Log to open_time_log for send time optimization
    const [emailRow] = await pool.execute(
      'SELECT prospect_id, agent_id FROM sent_emails WHERE id = ?', [id]
    );
    if (emailRow.length > 0) {
      const now = new Date();
      await pool.execute(
        'INSERT INTO open_time_log (prospect_id, agent_id, hour_utc, day_of_week, opened_at) VALUES (?, ?, ?, ?, NOW())',
        [emailRow[0].prospect_id, emailRow[0].agent_id, now.getUTCHours(), now.getUTCDay()]
      );
    }

    // Update A/B variant open count if applicable
    try {
      const { recordVariantOpen } = await import('./ab.js');
      await recordVariantOpen(id);
    } catch (e) { /* non-fatal */ }
  } catch (err) {
    // Don't let tracking errors break anything
  }

  // Always return the pixel regardless of DB success
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.send(PIXEL);
});

// GET /click/:id - track link click and redirect
router.get('/click/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const encodedUrl = req.query.url;

  // Decode original URL
  let originalUrl = 'https://1cloudcommunications.com';
  if (encodedUrl) {
    try {
      originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
    } catch (e) {
      originalUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    }
  }

  try {
    if (id && !isNaN(id)) {
      // Get prospect_id from sent_email
      const [rows] = await pool.execute('SELECT prospect_id FROM sent_emails WHERE id = ?', [id]);
      const prospectId = rows.length > 0 ? rows[0].prospect_id : null;

      // Log click event
      await pool.execute(
        'INSERT INTO click_events (sent_email_id, prospect_id, url) VALUES (?, ?, ?)',
        [id, prospectId, originalUrl]
      );

      // Increment click count on sent_email
      await pool.execute(
        'UPDATE sent_emails SET click_count = click_count + 1 WHERE id = ?',
        [id]
      );
    }
  } catch (err) {
    // Don't let tracking errors block the redirect
  }

  res.redirect(302, originalUrl);
});

export default router;
