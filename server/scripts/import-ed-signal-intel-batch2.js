// Import Ed's Signal Intel Batch 2 into partner cadence (Lauren + Ed, sequence_id=2)
// Enrolls as PAUSED so send-next picks them up one at a time with AI opener
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import pool from '../db/connection.js';

const SEQUENCE_ID = 2; // Lauren + Ed - Partner Intro

const contacts = [
  { first: 'Martin', last: 'Tesitel', email: 'martin.tesitel@linetgroup.com', company: 'LINET Americas', title: 'President & CEO', phone: '+420 603 880 790', trigger_type: 'relocation', headline: 'LINET Group Opens New Headquarters in Santa Fe, Mexico City - Mexico Business News' },
  { first: 'Wes', last: 'Adams', email: 'wes.adams@grand1847.com', company: 'Grand Hotel Golf Resort and Spa', title: 'Director of IT', phone: '251-367-5554', trigger_type: 'new_facility', headline: 'Autograph Collection Hotel breaks ground on Madeira Beach after decade of planning - The Business Journals' },
  { first: 'Noel', last: 'Zammit', email: 'noel.zammit@kindle-energy.com', company: 'Kindle Energy', title: 'Director of Information Technology', phone: '+1 917-750-3526', trigger_type: 'new_facility', headline: 'Kindle Energy Breaks Ground on $1.2B Blackstone-Backed Power Plant in West Virginia - citybiz' },
  { first: 'Scott', last: 'Hardy', email: 'scott.hardy@urbanarmorgear.com', company: 'URBAN ARMOR GEAR (UAG)', title: 'Chief Executive Officer', phone: '+1 612-423-5195', trigger_type: 'ma_acquisition', headline: 'Urban Armor Gear Announces Acquisition of Nomad Goods - Business Wire' },
  { first: 'Sarah', last: "O'Halloran", email: 'sbrennan@brennanllc.com', company: 'Brennan Investment Group', title: 'Director of Operations', phone: '+1 630-229-3132', trigger_type: 'new_facility', headline: 'Brennan Investment Group Breaks Ground on 140,000-SF Tovala Facility in Illinois - citybiz' },
  { first: 'Gerard', last: 'Heuvel', email: 'gerard.vdheuvel@pomtoc.com', company: 'Port of Miami Terminal Operating Company (POMTOC)', title: 'Chief Executive Officer', phone: '+1 604-252-2477', trigger_type: 'ma_acquisition', headline: 'Miami company acquires Texas HVAC business with 230 employees - The Business Journals' },
  { first: 'Michael', last: 'Skaife', email: 'mskaife@teslarsoftware.com', company: 'Teslar Software', title: 'Chief Operations Officer', phone: '+1 979-864-5061', trigger_type: 'relocation', headline: 'Teslar Software opens in new office building - Talk Business & Politics' },
  { first: 'Chris', last: 'Baldus', email: 'chris@ridgeline-roofing.com', company: 'Ridgeline Roofing & Restoration', title: 'Co-Founder & CEO', phone: '2057899733', trigger_type: 'relocation', headline: 'Ridgeline Roofing & Restoration Breaks Ground on New Headquarters in Odenville, Alabama - Morningstar' },
  { first: 'Elizabeth', last: 'Ancona', email: 'eancona@compugen.com', company: 'Compugen Systems, Inc.', title: 'Senior Director Finance + Operations', phone: '+1 315-404-2678', trigger_type: 'relocation', headline: 'Compugen Systems Inc. Establishes New Headquarters in Syracuse, NY - PR Newswire' },
  { first: 'Chad', last: 'Ingersoll', email: 'chad.ingersoll@fermiamerica.com', company: 'Fermi America', title: 'VP Operations', phone: '+1 701-261-9405', trigger_type: 'relocation', headline: "Fermi Inc. Announces 'Fermi 2.0', leadership transitions, new office locations - NewsChannel 10" },
  { first: 'Casey', last: 'Flack', email: 'caseyf@iwi.us', company: 'IWI US, Inc.', title: 'CEO', phone: '+1 717-557-6216', trigger_type: 'relocation', headline: 'IWI US, Inc. opens new headquarters in Andersonville - WATE 6 On Your Side' },
  { first: 'Mehdi', last: 'Mahmud', email: 'mehdi.mahmud@feim.com', company: 'First Eagle Investments', title: 'President & CEO', phone: '+1 212-698-3212', trigger_type: 'ma_acquisition', headline: 'First Eagle Investments Completes Acquisition of Diamond Hill Investment Group - Business Wire' },
  { first: 'Sam', last: 'Bryson', email: 'sbryson@origamirisk.com', company: 'Origami Risk', title: 'Director of IT & Business Applications', phone: '+1 435-764-4958', trigger_type: 'relocation', headline: 'Origami Risk Expands Global Footprint with New Office in the Dominican Republic - 01net' },
  { first: 'Luke', last: 'Myers', email: 'ltmyers@kelmann.com', company: 'Kelmann Restoration', title: 'Operations Manager', phone: '+1 414-727-3634', trigger_type: 'relocation', headline: "Kelmann Restoration moves headquarters to Milwaukee's northwest side - Milwaukee Journal Sentinel" },
  { first: 'Scott', last: 'Gautreau', email: 'sgautreau@turner-industries.com', company: 'Turner Industries Inc', title: 'Director of Information Security', phone: '(225) 223-0385', trigger_type: null, headline: null },
  { first: 'Keith', last: 'Pupecki', email: 'keith.pupecki@innovex.tech', company: 'INNOVEX', title: 'Sr. Operations Manager', phone: '+1 401-497-1229', trigger_type: 'ma_acquisition', headline: 'Innovex Completes Acquisition of Drilling Innovative Solutions - Business Wire' },
  { first: 'Marilyn', last: 'Sims', email: 'marilyn.sims@urbanleagueneb.org', company: 'Urban League of Nebraska, Inc.', title: 'COO/Interim President & CEO', phone: '+1 402-208-9918', trigger_type: 'new_facility', headline: 'Urban League breaks ground on $3.3M cultural center at St. Louis headquarters - The Business Journals' },
];

async function main() {
  const [seqRows] = await pool.execute('SELECT id, agent_id, partner_agent_id FROM partner_sequences WHERE id = ?', [SEQUENCE_ID]);
  if (!seqRows.length) throw new Error('Sequence not found');
  const seq = seqRows[0];

  let imported = 0, skipped = 0, enrolled = 0, dupEnroll = 0;

  for (const c of contacts) {
    const sourceStr = c.trigger_type && c.headline
      ? `signal-intel-partner: SIGNAL INTEL -- Trigger: ${c.trigger_type} | ${c.headline.slice(0, 150)}`
      : 'signal-intel-partner: Ed batch 2';

    // Upsert prospect
    const [existing] = await pool.execute('SELECT id FROM prospects WHERE email = ?', [c.email]);
    let prospectId;

    if (existing.length > 0) {
      prospectId = existing[0].id;
      skipped++;
      console.log(`  SKIP (exists): ${c.first} ${c.last} <${c.email}>`);
    } else {
      const [result] = await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, source, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'in_sequence')`,
        [c.first, c.last, c.email, c.company, c.title, c.phone || null, sourceStr]
      );
      prospectId = result.insertId;
      imported++;
      console.log(`  IMPORT: ${c.first} ${c.last} <${c.email}> (id=${prospectId})`);
    }

    // Check not already enrolled
    const [existEnroll] = await pool.execute(
      `SELECT id FROM partner_enrollments WHERE prospect_id = ? AND sequence_id = ? AND status IN ('active','waiting_partner','paused')`,
      [prospectId, SEQUENCE_ID]
    );

    if (existEnroll.length > 0) {
      dupEnroll++;
      console.log(`  ALREADY ENROLLED: ${c.first} ${c.last}`);
    } else {
      await pool.execute(
        `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, status, current_step)
         VALUES (?, ?, ?, ?, 'paused', 1)`,
        [prospectId, seq.id, seq.agent_id, seq.partner_agent_id]
      );
      enrolled++;
      console.log(`  ENROLLED (paused): ${c.first} ${c.last} @ ${c.company}`);
    }
  }

  console.log(`\nDone. Imported: ${imported}, Existing: ${skipped}, Enrolled: ${enrolled}, Already enrolled: ${dupEnroll}`);

  const [[{ ready }]] = await pool.query("SELECT COUNT(*) AS ready FROM partner_enrollments WHERE status='paused' AND current_step=1");
  console.log(`Ready to send (paused step 1): ${ready}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
