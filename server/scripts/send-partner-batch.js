// Send partner cadence step 1 emails with natural spacing (3-5 min random gaps)
// Usage: node server/scripts/send-partner-batch.js [count] [--bcc email]
// Example: node server/scripts/send-partner-batch.js 5 --bcc jonathan@1cloudcommunications.com
import 'dotenv/config';

const args = process.argv.slice(2);
const count = parseInt(args.find(a => /^\d+$/.test(a)) || '999', 10);
const bccIdx = args.indexOf('--bcc');
const bcc = bccIdx !== -1 ? args[bccIdx + 1] : null;

const MIN_DELAY_MS = 390 * 1000;  // 6.5 min
const MAX_DELAY_MS = 450 * 1000;  // 7.5 min

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function formatDelay(ms) {
  return `${Math.round(ms / 1000)}s (~${(ms / 60000).toFixed(1)} min)`;
}

async function sendNext() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
  try {
    const res = await fetch('http://localhost:3001/api/partner-cadence/send-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bcc ? { bcc } : {}),
      signal: controller.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(`[PartnerBatch] Starting — up to ${count} sends, BCC: ${bcc || 'none'}`);
  if (bcc) console.log(`[PartnerBatch] BCC: ${bcc}`);

  let sent = 0;
  let retries = 0;

  for (let i = 0; i < count; i++) {
    let result;
    try {
      result = await sendNext();
    } catch (err) {
      if (retries < 3) {
        retries++;
        console.log(`[PartnerBatch] Connection error (${err.message}), retrying in 30s... (${retries}/3)`);
        await new Promise(r => setTimeout(r, 30000));
        i--;
        continue;
      }
      console.error(`[PartnerBatch] Failed after 3 retries:`, err.message);
      break;
    }
    retries = 0;

    if (!result.sent) {
      if (result.remaining === 0 || result.message?.includes('No more')) {
        console.log(`[PartnerBatch] Queue empty after ${sent} sends.`);
        break;
      }
      console.error(`[PartnerBatch] Send failed:`, result.error || result);
      break;
    }

    sent++;
    console.log(`[${sent}] ${result.prospect} @ ${result.company}`);
    console.log(`    Opener: "${result.ai_opener}"`);
    console.log(`    Remaining: ${result.remaining}`);

    if (result.remaining === 0 || sent >= count) break;

    const delay = randomDelay();
    console.log(`    Waiting ${formatDelay(delay)} before next send...\n`);
    await new Promise(r => setTimeout(r, delay));
  }

  console.log(`\n[PartnerBatch] Done. Sent ${sent} email(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
