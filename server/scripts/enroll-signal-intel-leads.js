// Enroll all clean signal intel leads into SDR cadences
// Filters out: already enrolled, dismissed, no email, email already in prospects
// Usage: node server/scripts/enroll-signal-intel-leads.js [--dry-run]
import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import pool from '../db/connection.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  // Get active agents (outbound) and active sequence
  const [agents] = await pool.query("SELECT id, name FROM agents WHERE status = 'active' AND role = 'outbound' ORDER BY id");
  const [seqs] = await pool.query("SELECT id, name FROM sequences WHERE status = 'active' LIMIT 1");

  if (!agents.length) { console.error('No active outbound agents found.'); process.exit(1); }
  if (!seqs.length) { console.error('No active sequences found.'); process.exit(1); }

  const sequence = seqs[0];
  console.log(`Enrolling into sequence: "${sequence.name}" (id=${sequence.id})`);
  console.log(`Agents: ${agents.map(a => a.name).join(', ')}\n`);

  // Get existing prospect emails for dedup
  const [existingProspects] = await pool.query('SELECT email FROM prospects WHERE email IS NOT NULL');
  const existingEmails = new Set(existingProspects.map(p => p.email.toLowerCase()));

  // Get all enrollable signal intel leads
  const [leads] = await pool.query(`
    SELECT * FROM signal_intel_leads
    WHERE status = 'new'
      AND contact_email IS NOT NULL AND contact_email != ''
    ORDER BY score DESC, created_at DESC
  `);

  console.log(`Found ${leads.length} new leads with emails to evaluate.\n`);

  let enrolled = 0, skippedDupe = 0, skippedNoEmail = 0;
  let agentIndex = 0;

  for (const lead of leads) {
    const emailLower = lead.contact_email.toLowerCase();

    // Skip if email already in prospects
    if (existingEmails.has(emailLower)) {
      skippedDupe++;
      // Mark as enrolled so it doesn't keep showing up
      if (!dryRun) {
        const [ep] = await pool.query('SELECT id FROM prospects WHERE email = ?', [lead.contact_email]);
        if (ep.length) {
          await pool.execute(
            "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
            [ep[0].id, lead.id]
          );
        }
      }
      console.log(`  [SKIP-DUPE] ${lead.contact_name} @ ${lead.company}`);
      continue;
    }

    // Round-robin agent assignment
    const agent = agents[agentIndex % agents.length];
    agentIndex++;

    const nameParts = (lead.contact_name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const triggerNote = `SIGNAL INTEL -- Trigger: ${lead.trigger_type} | ${(lead.trigger_headline || '').slice(0, 150)} | Source: ${lead.trigger_source || ''} | URL: ${lead.trigger_url || ''} | Score: ${lead.score}`;
    const sourceStr = `signal-intel: ${triggerNote}`;

    if (!dryRun) {
      const [result] = await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, company_size, industry, city, state, apollo_id, source, status, assigned_agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence', ?)`,
        [
          firstName, lastName, lead.contact_email,
          lead.company || null, lead.contact_title || null,
          lead.contact_phone || null, lead.contact_linkedin || null,
          lead.employee_count ? String(lead.employee_count) : null,
          lead.industry || null,
          lead.city || null, lead.state || null,
          lead.apollo_id || null, sourceStr, agent.id,
        ]
      );

      const prospectId = result.insertId;
      existingEmails.add(emailLower); // prevent double-insert within this run

      await pool.execute(
        `INSERT INTO enrollments (prospect_id, sequence_id, agent_id, current_step, status)
         VALUES (?, ?, ?, 1, 'active')`,
        [prospectId, sequence.id, agent.id]
      );

      await pool.execute(
        "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
        [prospectId, lead.id]
      );
    }

    enrolled++;
    console.log(`  [${dryRun ? 'DRY-RUN' : 'ENROLLED'}] ${lead.contact_name} @ ${lead.company} → ${agent.name} | score=${lead.score} | ${lead.trigger_type}`);
  }

  console.log(`\nDone. Enrolled: ${enrolled}, Skipped (dupe): ${skippedDupe}`);
  if (dryRun) console.log('(DRY RUN — no changes written)');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
