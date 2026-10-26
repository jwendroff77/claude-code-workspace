// Public one-click Approve / Skip links from the replacement alert email.
// Each link carries an HMAC of the approval id, so it can't be guessed or altered.
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { verifyReplacement, ensureReplacementTable } from '../services/replacement.js';

const router = Router();

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>body{font-family:Segoe UI,Arial,sans-serif;background:#f5f5f5;color:#222;margin:0;padding:40px 16px}
  .box{max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 12px}</style></head><body><div class="box"><h1>${title}</h1>${body}</div></body></html>`;
}

function validSig(id, sig) {
  return verifyReplacement(id, sig);
}

async function load(req, res) {
  await ensureReplacementTable();
  const id = parseInt(req.params.id, 10);
  if (!id || !validSig(id, req.params.sig)) {
    res.status(403).send(page('Link not valid', '<p>This link is not valid.</p>'));
    return null;
  }
  const [[row]] = await pool.execute(
    `SELECT ra.*, p.first_name, p.last_name, p.email, p.company
     FROM replacement_approvals ra JOIN prospects p ON p.id = ra.new_prospect_id WHERE ra.id = ?`,
    [id]
  );
  if (!row) {
    res.status(404).send(page('Not found', '<p>This replacement no longer exists.</p>'));
    return null;
  }
  if (row.status !== 'pending') {
    res.send(page('Already done', `<p>This one was already <strong>${row.status}</strong>.</p>`));
    return null;
  }
  return row;
}

router.get('/approve/:id/:sig', async (req, res) => {
  try {
    const row = await load(req, res);
    if (!row) return;
    await pool.execute("UPDATE prospects SET status = 'in_sequence', updated_at = NOW() WHERE id = ?", [row.new_prospect_id]);
    await pool.execute(
      "UPDATE partner_enrollments SET status = 'active' WHERE id = ? AND status = 'paused' AND current_step = 1",
      [row.enrollment_id]
    );
    await pool.execute("UPDATE replacement_approvals SET status = 'approved', decided_at = NOW() WHERE id = ?", [row.id]);
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email;
    res.send(page('Approved', `<p><strong>${name}</strong> at ${row.company} is in the cadence.</p>
      <p>The step 1 intro goes out in the next weekday send window (7:40am to 4:55pm CT), after NeverBounce checks the address.</p>`));
  } catch (e) {
    console.error('[Replacement] approve failed:', e.message);
    res.status(500).send(page('Something went wrong', '<p>Nothing was changed.  Please try again.</p>'));
  }
});

router.get('/skip/:id/:sig', async (req, res) => {
  try {
    const row = await load(req, res);
    if (!row) return;
    await pool.execute("UPDATE partner_enrollments SET status = 'cancelled', completed_at = NOW() WHERE id = ?", [row.enrollment_id]);
    await pool.execute("UPDATE prospects SET status = 'disqualified', updated_at = NOW() WHERE id = ?", [row.new_prospect_id]);
    await pool.execute("UPDATE replacement_approvals SET status = 'skipped', decided_at = NOW() WHERE id = ?", [row.id]);
    res.send(page('Skipped', `<p>No email will go to ${row.email}.</p>`));
  } catch (e) {
    console.error('[Replacement] skip failed:', e.message);
    res.status(500).send(page('Something went wrong', '<p>Nothing was changed.  Please try again.</p>'));
  }
});

export default router;
