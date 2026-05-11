// Bulk enrich + enroll contacts from Apollo by vertical/industry
// Usage: node server/scripts/bulk-enroll-apollo.js [--count 600] [--dry-run]
// Pulls from construction, restaurant, franchise verticals, enriches emails, enrolls in sequences
import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import pool from '../db/connection.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const countArg = args.find(a => a.startsWith('--count=') || /^\d+$/.test(a));
const MAX_ENROLL = countArg ? parseInt(countArg.replace('--count=', '')) : 600;

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

const VERTICALS = [
  {
    label: 'Commercial Construction',
    keyword_tags: ['commercial construction', 'general contractor', 'construction management'],
  },
  {
    label: 'Restaurant Groups',
    keyword_tags: ['restaurants', 'restaurant group', 'food service', 'multi-unit restaurant'],
  },
  {
    label: 'Franchise Groups',
    keyword_tags: ['franchise', 'franchisee', 'franchise group', 'multi-unit franchise'],
  },
];

const TITLES = [
  'IT Director', 'Director of IT', 'VP of IT', 'Vice President of IT',
  'CIO', 'Chief Information Officer', 'Director of Information Technology',
  'CTO', 'Chief Technology Officer', 'IT Manager',
  'Director of Operations', 'VP of Operations', 'Vice President of Operations',
  'COO', 'Chief Operating Officer',
];

const EMP_RANGES = ['51,200', '201,500', '501,1000', '1001,5000'];

async function searchApollo({ keyword_tags, page }) {
  const res = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_API_KEY },
    body: JSON.stringify({
      q_organization_keyword_tags: keyword_tags,
      person_titles: TITLES,
      organization_num_employees_ranges: EMP_RANGES,
      person_locations: ['United States'],
      contact_email_status: ['verified', 'likely to engage'],
      per_page: 100,
      page,
    }),
  });
  if (!res.ok) throw new Error(`Apollo search error: ${res.status}`);
  return res.json();
}

async function enrichPerson(apolloId) {
  const res = await fetch('https://api.apollo.io/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_API_KEY },
    body: JSON.stringify({ id: apolloId, reveal_personal_emails: false }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.person || null;
}

async function main() {
  const [agents] = await pool.query("SELECT id, name FROM agents WHERE status = 'active' AND role = 'outbound' ORDER BY id");
  const [seqs] = await pool.query("SELECT id, name FROM sequences WHERE status = 'active' LIMIT 1");

  if (!agents.length || !seqs.length) { console.error('No agents or sequences found.'); process.exit(1); }

  const sequence = seqs[0];
  console.log(`Sequence: "${sequence.name}" | Agents: ${agents.map(a => a.name).join(', ')}`);
  console.log(`Target: ${MAX_ENROLL} enrollments | Dry run: ${dryRun}\n`);

  const [existingProspects] = await pool.query('SELECT email, apollo_id FROM prospects WHERE email IS NOT NULL');
  const existingEmails = new Set(existingProspects.map(p => p.email.toLowerCase()));
  const existingApolloIds = new Set(existingProspects.map(p => p.apollo_id).filter(Boolean));

  let totalEnrolled = 0;
  let totalSkipped = 0;
  let creditUsed = 0;
  let agentIndex = 0;

  for (const vertical of VERTICALS) {
    if (totalEnrolled >= MAX_ENROLL) break;
    const perVertical = Math.ceil((MAX_ENROLL - totalEnrolled) / (VERTICALS.indexOf(vertical) === VERTICALS.length - 1 ? 1 : VERTICALS.length - VERTICALS.indexOf(vertical)));

    console.log(`\n── ${vertical.label} (targeting ~${perVertical} enrollments) ──`);

    let page = 1;
    let verticalEnrolled = 0;

    while (verticalEnrolled < perVertical && totalEnrolled < MAX_ENROLL) {
      const data = await searchApollo({ keyword_tags: vertical.keyword_tags, page });
      const people = data.people || [];
      if (!people.length) break;

      for (const person of people) {
        if (verticalEnrolled >= perVertical || totalEnrolled >= MAX_ENROLL) break;

        // Skip if already in DB by apollo_id
        if (person.id && existingApolloIds.has(person.id)) {
          totalSkipped++;
          continue;
        }

        // Enrich to get email
        await new Promise(r => setTimeout(r, 300));
        const enriched = await enrichPerson(person.id);
        creditUsed++;

        if (!enriched || !enriched.email) {
          continue;
        }

        const emailLower = enriched.email.toLowerCase();
        if (existingEmails.has(emailLower)) {
          totalSkipped++;
          existingApolloIds.add(person.id);
          continue;
        }

        const org = enriched.organization || {};
        const agent = agents[agentIndex % agents.length];
        agentIndex++;

        const firstName = enriched.first_name || '';
        const lastName = enriched.last_name || '';
        const empCount = org.estimated_num_employees || null;

        console.log(`  [${dryRun ? 'DRY' : 'ENROLL'}] ${firstName} ${lastName} @ ${org.name || ''} | ${enriched.title || ''} | ${vertical.label}`);

        if (!dryRun) {
          const [result] = await pool.execute(
            `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, company_size, industry, city, state, apollo_id, source, status, assigned_agent_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence', ?)`,
            [
              firstName, lastName, enriched.email,
              org.name || null, enriched.title || null,
              enriched.phone_numbers?.[0]?.sanitized_number || null,
              enriched.linkedin_url || null,
              empCount ? String(empCount) : null,
              org.industry || vertical.label,
              enriched.city || null, enriched.state || null,
              enriched.id || null,
              `apollo-${vertical.label.toLowerCase().replace(/\s+/g, '-')}`,
              agent.id,
            ]
          );

          const prospectId = result.insertId;
          existingEmails.add(emailLower);
          existingApolloIds.add(enriched.id);

          await pool.execute(
            `INSERT INTO enrollments (prospect_id, sequence_id, agent_id, current_step, status) VALUES (?, ?, ?, 1, 'active')`,
            [prospectId, sequence.id, agent.id]
          );
        }

        verticalEnrolled++;
        totalEnrolled++;
      }

      page++;
      if (people.length < 100) break;
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`  ${vertical.label}: ${verticalEnrolled} enrolled`);
  }

  console.log(`\n══ Done ══`);
  console.log(`Enrolled: ${totalEnrolled} | Skipped (dupes): ${totalSkipped} | Apollo credits used: ${creditUsed}`);
  if (dryRun) console.log('(DRY RUN — no changes written)');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
