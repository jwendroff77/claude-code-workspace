// Replacement contacts: when a prospect replies that they retired / left / are no
// longer in the role and names who took over, stage that person in the same partner
// cadence (PAUSED, step 1) and email Jonathan one-click Approve / Skip links.
// Nothing is sent to the new person until Jonathan approves (his rule, 2026-10-11).
import crypto from 'crypto';
import pool from '../db/connection.js';
import { sendMail } from './graph.js';
import { extractReplacement } from './ai.js';

const OWNER_ALERT_EMAIL = 'jonathan@1cloudcommunications.com';
import { signLink, verifyLink } from './linkSecret.js';

// Cheap gate before spending an AI call.  No subject-line out-of-office filter: people
// often announce a retirement with an auto-reply (MotorWorld, 8 Oct).  The AI step
// separates "away this week" from "gone for good".
const DEPARTURE = /\b(retired|retiring|retirement|no longer (with|at|employed|in (this|that|the|my) (role|position))|(has|have) left|left (the|our) (company|firm|organization)|last day|moved on|successor|replaced by|taken over|took over|now (handling|responsible|in charge))\b/i;
const SHARED_MAILBOX = /^(info|accounting|accounts|ap|ar|admin|office|it|support|help|helpdesk|hr|sales|billing|contact|hello|reception)@/i;

// Public base for the approve/skip links: same host the unsubscribe links use.
function publicBase() {
  const unsub = process.env.UNSUB_URL || '';
  if (unsub.includes('/api/unsubscribe')) return unsub.replace(/\/api\/unsubscribe.*$/, '/api/replacement');
  return 'https://claude-code-workspace-production.up.railway.app/api/replacement';
}

export function signReplacement(id) {
  return signLink(`replacement:${id}`, 24);
}

// Accepts the current link secret and any old one, so Approve/Skip links already emailed keep working.
export function verifyReplacement(id, sig) {
  return verifyLink(`replacement:${id}`, sig, 24);
}

let tableReady = false;
export async function ensureReplacementTable() {
  if (tableReady) return;
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS replacement_approvals (
       id INT AUTO_INCREMENT PRIMARY KEY,
       old_prospect_id INT NOT NULL,
       new_prospect_id INT NOT NULL,
       enrollment_id INT NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       quote TEXT,
       created_at DATETIME NOT NULL,
       decided_at DATETIME NULL
     )`
  );
  tableReady = true;
}

const domainOf = email => (email.split('@')[1] || '').toLowerCase();
// "mail.acme.com" and "acme.com" are the same company; compare the last two labels.
const rootOf = domain => domain.split('.').slice(-2).join('.');

async function alert(fromEmail, subject, html) {
  try {
    await sendMail({ fromEmail, to: OWNER_ALERT_EMAIL, subject, html });
  } catch (e) {
    console.error(`[Replacement] alert failed: ${e.message}`);
  }
}

// Called for every reply from a known prospect.  Returns the staged approval id, or null.
export async function handlePossibleReplacement({ agent, prospectId, subject, text, senderEmail }) {
  if (!text || !DEPARTURE.test(text)) return null;

  const [[old]] = await pool.execute(
    'SELECT id, first_name, last_name, title, email, company, city, state, industry, status FROM prospects WHERE id = ?',
    [prospectId]
  );
  if (!old) return null;

  // v1: partner-cadence prospects only, so the new contact goes to the same SDR + partner.
  const [[pe]] = await pool.execute(
    `SELECT id, sequence_id, agent_id, partner_agent_id FROM partner_enrollments
     WHERE prospect_id = ? ORDER BY id DESC LIMIT 1`,
    [prospectId]
  );
  if (!pe) return null;

  await ensureReplacementTable();
  const [already] = await pool.execute('SELECT id FROM replacement_approvals WHERE old_prospect_id = ?', [prospectId]);
  if (already.length > 0) return null;

  const formerName = [old.first_name, old.last_name].filter(Boolean).join(' ');
  const mailbox = agent.smtp_user || agent.email;
  const result = await extractReplacement({ text, company: old.company, formerName });
  if (!result || !result.departed) return null;

  // Departed either way: stop the old contact so nothing more goes to them.
  await pool.execute(
    `UPDATE partner_enrollments SET status = 'cancelled', completed_at = NOW()
     WHERE prospect_id = ? AND status <> 'cancelled'`,
    [old.id]
  );
  await pool.execute(
    `UPDATE prospect_sequence_enrollment SET status = 'cancelled'
     WHERE prospect_id = ? AND status IN ('active', 'paused')`,
    [old.id]
  );
  await pool.execute("UPDATE prospects SET status = 'disqualified', updated_at = NOW() WHERE id = ?", [old.id]);
  await pool.execute(
    'INSERT INTO exclusion_list (email, company, reason) VALUES (?, ?, ?)',
    [old.email, old.company, `No longer in role (auto-detected reply): ${(result.quote || '').slice(0, 180)}`]
  );

  const r = result.replacement || {};
  const email = (r.email || '').trim().toLowerCase();
  // Same company = the old contact's domain, or the domain the reply came from
  // (HUB International bought Catto: we emailed @catto.com, the reply and the
  // successor were @hubinternational.com).
  const companyRoots = [old.email, senderEmail].filter(Boolean).map(e => rootOf(domainOf(e)));
  const sameCompany = email && companyRoots.includes(rootOf(domainOf(email)));
  const usable = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && !SHARED_MAILBOX.test(email) && sameCompany;

  let existing = [];
  if (usable) [existing] = await pool.execute('SELECT id FROM prospects WHERE LOWER(email) = ?', [email]);

  if (!usable || existing.length > 0) {
    const why = !email ? 'no replacement email was named'
      : !sameCompany ? `the named email (${email}) is not at ${[...new Set(companyRoots)].join(' or ')}`
      : SHARED_MAILBOX.test(email) ? `the named email (${email}) is a shared mailbox, not a person`
      : existing.length > 0 ? `${email} is already in the platform`
      : `could not read a valid email (${email})`;
    await alert(mailbox, `[Replacement - review] ${formerName} at ${old.company} has left`, `
      <p><strong>${formerName}</strong> (${old.title || ''}) at <strong>${old.company}</strong> is no longer in the role, so their cadence is stopped.</p>
      <p>No replacement was staged because ${why}.</p>
      <p><em>"${(result.quote || '').replace(/</g, '&lt;')}"</em></p>`);
    console.log(`[Replacement] ${old.email} departed; not staged (${why})`);
    return null;
  }

  // Stage the new contact PAUSED; only Approve makes it sendable.  email_status stays
  // empty so NeverBounce checks the address before its first send.
  const [ins] = await pool.execute(
    `INSERT INTO prospects (first_name, last_name, email, company, title, industry, city, state, assigned_agent_id, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_scrub')`,
    [r.first_name || null, r.last_name || null, email, old.company, r.title || null, old.industry, old.city, old.state,
     pe.agent_id, `replacement-of-${old.id}`]
  );
  const [enr] = await pool.execute(
    `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, status, current_step)
     VALUES (?, ?, ?, ?, 'paused', 1)`,
    [ins.insertId, pe.sequence_id, pe.agent_id, pe.partner_agent_id]
  );
  const [appr] = await pool.execute(
    `INSERT INTO replacement_approvals (old_prospect_id, new_prospect_id, enrollment_id, status, quote, created_at)
     VALUES (?, ?, ?, 'pending', ?, NOW())`,
    [old.id, ins.insertId, enr.insertId, result.quote || null]
  );

  const sig = signReplacement(appr.insertId);
  const base = publicBase();
  const newName = [r.first_name, r.last_name].filter(Boolean).join(' ') || email;
  await alert(mailbox, `[Replacement - approve?] ${old.company}: ${formerName} -> ${newName}`, `
    <p><strong>${formerName}</strong> (${old.title || ''}) at <strong>${old.company}</strong> is no longer in the role and named a replacement:</p>
    <p style="font-size:15px"><strong>${newName}</strong>${r.title ? `, ${r.title}` : ''}<br>${email}</p>
    <p><em>"${(result.quote || '').replace(/</g, '&lt;')}"</em></p>
    <p>${formerName}'s cadence is stopped.  ${newName} is staged in the same cadence and will get the step 1 intro (partner CC'd) only if you approve.</p>
    <p>
      <a href="${base}/approve/${appr.insertId}/${sig}" style="background:#0a7d32;color:#fff;padding:9px 18px;text-decoration:none;border-radius:4px;font-weight:bold">Approve</a>
      &nbsp;&nbsp;
      <a href="${base}/skip/${appr.insertId}/${sig}" style="background:#777;color:#fff;padding:9px 18px;text-decoration:none;border-radius:4px">Skip</a>
    </p>`);
  console.log(`[Replacement] ${old.email} -> ${email} staged (approval #${appr.insertId})`);
  return appr.insertId;
}
