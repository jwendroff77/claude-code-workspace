import pool from '../db/connection.js';

const NEVERBOUNCE_API_KEY = process.env.NEVERBOUNCE_API_KEY;
const NEVERBOUNCE_API_URL = 'https://api.neverbounce.com/v4';

// Verify a single email address
// Returns: { result, flags, status }
// result: valid, invalid, disposable, catchall, unknown
export async function verifyEmail(email) {
  if (!NEVERBOUNCE_API_KEY) {
    console.log('[EmailVerify] No API key set - skipping verification');
    return { result: 'unknown', flags: [], status: 'skipped' };
  }

  try {
    const res = await fetch(`${NEVERBOUNCE_API_URL}/single/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: NEVERBOUNCE_API_KEY,
        email: email,
      }),
    });

    const data = await res.json();

    // NeverBounce returns result as string ("valid", "invalid", etc.)
    // or numeric (0=valid, 1=invalid, 2=disposable, 3=catchall, 4=unknown)
    const numericMap = { 0: 'valid', 1: 'invalid', 2: 'disposable', 3: 'catchall', 4: 'unknown' };
    const validResults = ['valid', 'invalid', 'disposable', 'catchall', 'unknown'];
    let result;
    if (typeof data.result === 'string' && validResults.includes(data.result)) {
      result = data.result;
    } else {
      result = numericMap[data.result] || 'unknown';
    }

    return {
      result,
      flags: data.flags || [],
      status: 'verified',
      raw: data,
    };
  } catch (err) {
    console.error(`[EmailVerify] API error for ${email}:`, err.message);
    return { result: 'unknown', flags: [], status: 'error' };
  }
}

// Verify and gate a prospect before enrollment
// Returns true if safe to send, false if should be blocked
export async function verifyAndUpdate(prospectId) {
  const [rows] = await pool.execute('SELECT email FROM prospects WHERE id = ?', [prospectId]);
  if (rows.length === 0) return false;

  const { result } = await verifyEmail(rows[0].email);

  // Update prospect with verification result
  await pool.execute(
    'UPDATE prospects SET email_status = ?, email_verified_at = NOW() WHERE id = ?',
    [result, prospectId]
  );

  // Block invalid and disposable emails
  if (result === 'invalid' || result === 'disposable') {
    await pool.execute(
      "UPDATE prospects SET status = 'bounced', updated_at = NOW() WHERE id = ?",
      [prospectId]
    );
    await pool.execute(
      `UPDATE prospect_sequence_enrollment SET status = 'cancelled'
       WHERE prospect_id = ? AND status IN ('active', 'paused')`,
      [prospectId]
    );
    await pool.execute(
      "INSERT INTO exclusion_list (email, reason, added_at) VALUES (?, ?, NOW())",
      [rows[0].email, `email_verification: ${result}`]
    );
    console.log(`[EmailVerify] ${rows[0].email} -> ${result} (blocked)`);
    return false;
  }

  // Catchall is risky but not blocked - flag it
  if (result === 'catchall') {
    console.log(`[EmailVerify] ${rows[0].email} -> catchall (allowed but risky)`);
  }

  return true;
}

// Bulk verify all unverified prospects
// Processes in batches to avoid rate limits
export async function bulkVerify({ batchSize = 100, delayMs = 1000 } = {}) {
  if (!NEVERBOUNCE_API_KEY) {
    console.log('[EmailVerify] No API key set - cannot run bulk verify');
    return { verified: 0, invalid: 0, skipped: 0 };
  }

  const [prospects] = await pool.execute(
    "SELECT id, email FROM prospects WHERE (email_status IS NULL OR email_status = '') AND status NOT IN ('bounced', 'unsubscribed', 'disqualified')"
  );

  console.log(`[EmailVerify] Bulk verify starting: ${prospects.length} prospects to check`);

  let verified = 0;
  let invalid = 0;
  let errors = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];

    try {
      const safe = await verifyAndUpdate(p.id);
      if (!safe) invalid++;
      verified++;

      if (verified % 100 === 0) {
        console.log(`[EmailVerify] Progress: ${verified}/${prospects.length} (${invalid} invalid)`);
      }

      // Rate limit: ~1 request per second to stay within NeverBounce limits
      if (i < prospects.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err) {
      errors++;
      console.error(`[EmailVerify] Error on ${p.email}:`, err.message);
    }
  }

  console.log(`[EmailVerify] Bulk verify complete: ${verified} verified, ${invalid} invalid, ${errors} errors`);
  return { verified, invalid, errors, total: prospects.length };
}
