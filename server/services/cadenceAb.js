// A/B tests for the partner cadences (Jonathan 19 Nov 2026: "do A/B testing as a regular thing so we
// can start testing which messages are working better").  The old ab_tests tables only cover the drip
// sequences; this covers Kayla + Megan: step 1 intros ('step1') and the daily follow-ups ('step4').
//
// A test has 2+ versions.  Each version is a text swap on the step's normal copy: find_text -> replace_text.
// The control version swaps a sentence for itself (no change).  {{partner}} in either text is the
// partner's first name (Steven / Jared), so one test covers both agents.
// Each prospect stays on one version for the life of a test; new prospects go to whichever version has
// fewer sends, so the split stays even.  If the step's copy no longer contains find_text, nothing is swapped
// and the send is not counted (copy changed under the test: the results page says so).
//
// The system never picks a winner on its own: results go to the Monday brief and /api/cadence-ab, and
// Jonathan decides (his approval rule for all copy).
import pool from '../db/connection.js';

let ready = false;
export async function ensureAbTables() {
  if (ready) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS cadence_ab_tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    step_key VARCHAR(20) NOT NULL,
    agent_ids VARCHAR(100) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    winner_label VARCHAR(10) NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL)`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS cadence_ab_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    label VARCHAR(10) NOT NULL,
    description VARCHAR(200) NULL,
    find_text TEXT NOT NULL,
    replace_text TEXT NOT NULL)`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS cadence_ab_sends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    variant_id INT NOT NULL,
    prospect_id INT NOT NULL,
    agent_id INT NOT NULL,
    sent_email_id INT NULL,
    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (test_id, prospect_id), INDEX (variant_id))`);
  ready = true;
}

const fill = (t, partner) => String(t || '').replace(/\{\{partner\}\}/g, partner || '');

// Returns { html, ab } where ab is null when no test applies.  Never throws: a test must never stop a send.
export async function applyAb({ stepKey, agentId, prospectId, html, partnerName }) {
  try {
    await ensureAbTables();
    const [tests] = await pool.execute(
      `SELECT * FROM cadence_ab_tests WHERE status = 'active' AND step_key = ? ORDER BY id DESC`, [stepKey]);
    const test = tests.find(t => !t.agent_ids || String(t.agent_ids).split(',').map(Number).includes(Number(agentId)));
    if (!test) return { html, ab: null };
    const [variants] = await pool.execute('SELECT * FROM cadence_ab_variants WHERE test_id = ? ORDER BY label', [test.id]);
    if (variants.length < 2) return { html, ab: null };

    const [[prior]] = await pool.execute(
      'SELECT variant_id FROM cadence_ab_sends WHERE test_id = ? AND prospect_id = ? ORDER BY id LIMIT 1', [test.id, prospectId]);
    let v = prior && variants.find(x => x.id === prior.variant_id);
    if (!v) {
      const [counts] = await pool.execute(
        'SELECT variant_id, COUNT(*) n FROM cadence_ab_sends WHERE test_id = ? GROUP BY variant_id', [test.id]);
      const n = id => Number((counts.find(c => c.variant_id === id) || {}).n || 0);
      v = [...variants].sort((a, b) => n(a.id) - n(b.id) || a.label.localeCompare(b.label))[0];
    }
    const find = fill(v.find_text, partnerName);
    if (!html.includes(find)) {
      console.log(`[AB] test #${test.id}: copy no longer contains version ${v.label}'s text, sent as normal`);
      return { html, ab: null };
    }
    return { html: html.split(find).join(fill(v.replace_text, partnerName)), ab: { testId: test.id, variantId: v.id, label: v.label } };
  } catch (e) {
    console.error(`[AB] apply failed, sent as normal: ${e.message}`);
    return { html, ab: null };
  }
}

export async function recordAbSend({ ab, prospectId, agentId, sentEmailId = null }) {
  if (!ab) return;
  try {
    await pool.execute(
      'INSERT INTO cadence_ab_sends (test_id, variant_id, prospect_id, agent_id, sent_email_id) VALUES (?, ?, ?, ?, ?)',
      [ab.testId, ab.variantId, prospectId, agentId, sentEmailId]);
  } catch (e) { console.error(`[AB] record failed: ${e.message}`); }
}

// Per version: sends, and what the prospect did AFTER that send.  Partner and agent mail is not a reply.
export async function abResults({ testId = null, includeEnded = false } = {}) {
  await ensureAbTables();
  const [tests] = await pool.execute(
    `SELECT * FROM cadence_ab_tests WHERE ${testId ? 'id = ?' : includeEnded ? '1=1' : "status = 'active'"} ORDER BY id DESC`,
    testId ? [testId] : []);
  const out = [];
  for (const t of tests) {
    const [rows] = await pool.execute(`
      SELECT v.id, v.label, v.description,
        COUNT(s.id) sends,
        COALESCE(SUM(EXISTS(SELECT 1 FROM received_emails r WHERE r.prospect_id = s.prospect_id AND r.received_at > s.sent_at
          AND r.from_email NOT REGEXP 'comcast\\\\.com|1cloudnow\\\\.com|1cloudcommunications\\\\.com' AND COALESCE(r.sentiment, '') <> 'ooo')), 0) replied,
        COALESCE(SUM(EXISTS(SELECT 1 FROM received_emails r WHERE r.prospect_id = s.prospect_id AND r.received_at > s.sent_at
          AND r.sentiment IN ('positive', 'meeting_request', 'not_now', 'question', 'referral'))), 0) good,
        COALESCE(SUM(EXISTS(SELECT 1 FROM received_emails r WHERE r.prospect_id = s.prospect_id AND r.received_at > s.sent_at
          AND r.sentiment = 'negative')), 0) said_no,
        COALESCE(SUM(p.status = 'bounced'), 0) bounced,
        COALESCE(SUM(p.status IN ('booked', 'handed_off', 'won')), 0) booked
      FROM cadence_ab_variants v
      LEFT JOIN cadence_ab_sends s ON s.variant_id = v.id
      LEFT JOIN prospects p ON p.id = s.prospect_id
      WHERE v.test_id = ? GROUP BY v.id, v.label, v.description ORDER BY v.label`, [t.id]);
    const variants = rows.map(r => {
      const n = Number(r.sends), pct = x => (n ? Math.round(1000 * Number(x) / n) / 10 : 0);
      return { label: r.label, description: r.description, sends: n,
        replied: Number(r.replied), replyPct: pct(r.replied), good: Number(r.good), goodPct: pct(r.good),
        saidNo: Number(r.said_no), noPct: pct(r.said_no), bounced: Number(r.bounced), booked: Number(r.booked) };
    });
    out.push({ id: t.id, name: t.name, stepKey: t.step_key, status: t.status, startedAt: t.created_at, variants, verdict: verdict(variants) });
  }
  return out;
}

// Plain-English read: too early, or which version leads and whether it is believable yet.
// Two-proportion z-test on reply rate; needs 300+ sends each and z >= 1.96 (95%) to call it.
export function verdict(vs) {
  if (vs.length < 2) return 'Needs two versions.';
  const min = Math.min(...vs.map(v => v.sends));
  const [a, b] = [...vs].sort((x, y) => y.replyPct - x.replyPct);
  if (min < 300) return `Too early: ${min} sends on the smaller version, need about 300 each.`;
  const p1 = a.replied / a.sends, p2 = b.replied / b.sends, p = (a.replied + b.replied) / (a.sends + b.sends);
  const se = Math.sqrt(p * (1 - p) * (1 / a.sends + 1 / b.sends));
  const z = se ? (p1 - p2) / se : 0;
  if (z >= 1.96) return `Version ${a.label} is winning on replies (${a.replyPct}% vs ${b.replyPct}%), and the gap is big enough to trust.  Ready for your call.`;
  return `Version ${a.label} leads on replies (${a.replyPct}% vs ${b.replyPct}%), but the gap could still be chance.  Keep running.`;
}

// One line per active test for the Monday brief.
export async function abBriefLines() {
  try {
    const res = await abResults();
    return res.map(t => `<b>${t.name}</b>: ${t.variants.map(v => `${v.label} ${v.sends} sent, ${v.replyPct}% replied, ${v.good} good, ${v.saidNo} no`).join(' | ')}.  ${t.verdict}`);
  } catch { return []; }
}
