import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

// GET / - list all A/B tests with variants
router.get('/', async (req, res) => {
  try {
    const [tests] = await pool.query(`
      SELECT t.*, ss.step_number, ss.subject_line AS original_subject, s.name AS sequence_name
      FROM ab_tests t
      JOIN sequence_steps ss ON ss.id = t.sequence_step_id
      JOIN sequences s ON s.id = ss.sequence_id
      ORDER BY t.created_at DESC
    `);

    for (const test of tests) {
      const [variants] = await pool.execute(
        'SELECT * FROM ab_variants WHERE ab_test_id = ? ORDER BY variant_label',
        [test.id]
      );
      test.variants = variants;
    }

    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create A/B test with variant B
router.post('/', async (req, res) => {
  try {
    const { sequence_step_id, name, variant_b_subject, variant_b_body, min_sends } = req.body;

    // Get original step content for variant A
    const [steps] = await pool.execute('SELECT * FROM sequence_steps WHERE id = ?', [sequence_step_id]);
    if (steps.length === 0) return res.status(404).json({ error: 'Step not found' });
    const step = steps[0];

    // Create test
    const [testResult] = await pool.execute(
      'INSERT INTO ab_tests (sequence_step_id, name, min_sends) VALUES (?, ?, ?)',
      [sequence_step_id, name || `A/B Test - Step ${step.step_number}`, min_sends || 50]
    );
    const testId = testResult.insertId;

    // Create variant A (original)
    await pool.execute(
      'INSERT INTO ab_variants (ab_test_id, variant_label, subject_line, body_html) VALUES (?, ?, ?, ?)',
      [testId, 'A', step.subject_line, step.body_html]
    );

    // Create variant B
    await pool.execute(
      'INSERT INTO ab_variants (ab_test_id, variant_label, subject_line, body_html) VALUES (?, ?, ?, ?)',
      [testId, 'B', variant_b_subject, variant_b_body]
    );

    res.json({ id: testId, message: 'A/B test created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/pause - pause/resume test
router.put('/:id/pause', async (req, res) => {
  try {
    const { status } = req.body;
    await pool.execute('UPDATE ab_tests SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: `Test ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/promote - promote winner manually
router.post('/:id/promote', async (req, res) => {
  try {
    const { variant_id } = req.body;

    const [variants] = await pool.execute('SELECT * FROM ab_variants WHERE id = ?', [variant_id]);
    if (variants.length === 0) return res.status(404).json({ error: 'Variant not found' });
    const winner = variants[0];

    // Get the test to find the step
    const [tests] = await pool.execute('SELECT * FROM ab_tests WHERE id = ?', [req.params.id]);
    if (tests.length === 0) return res.status(404).json({ error: 'Test not found' });

    // Update original step with winner content
    await pool.execute(
      'UPDATE sequence_steps SET subject_line = ?, body_html = ? WHERE id = ?',
      [winner.subject_line, winner.body_html, tests[0].sequence_step_id]
    );

    // Mark test as completed
    await pool.execute(
      'UPDATE ab_tests SET status = ?, winner_variant_id = ? WHERE id = ?',
      ['completed', variant_id, req.params.id]
    );

    res.json({ message: `Variant ${winner.variant_label} promoted to step` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: get variant for a step (used by scheduler)
export async function getABVariant(stepId) {
  const [tests] = await pool.execute(
    "SELECT id FROM ab_tests WHERE sequence_step_id = ? AND status = 'active'",
    [stepId]
  );
  if (tests.length === 0) return null;

  // Get variant with fewest sends (round-robin)
  const [variants] = await pool.execute(
    'SELECT * FROM ab_variants WHERE ab_test_id = ? ORDER BY sends ASC, RAND() LIMIT 1',
    [tests[0].id]
  );

  return variants.length > 0 ? variants[0] : null;
}

// Helper: increment variant stats
export async function recordVariantSend(variantId) {
  await pool.execute('UPDATE ab_variants SET sends = sends + 1 WHERE id = ?', [variantId]);
}

export async function recordVariantOpen(sentEmailId) {
  const [rows] = await pool.execute(
    'SELECT ab_variant_id FROM sent_emails WHERE id = ?',
    [sentEmailId]
  );
  if (rows.length > 0 && rows[0].ab_variant_id) {
    await pool.execute('UPDATE ab_variants SET opens = opens + 1 WHERE id = ?', [rows[0].ab_variant_id]);
  }
}

export async function recordVariantReply(prospectId, sentiment) {
  // Find the most recent sent email with a variant for this prospect
  const [rows] = await pool.execute(
    'SELECT ab_variant_id FROM sent_emails WHERE prospect_id = ? AND ab_variant_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1',
    [prospectId]
  );
  if (rows.length > 0 && rows[0].ab_variant_id) {
    await pool.execute('UPDATE ab_variants SET replies = replies + 1 WHERE id = ?', [rows[0].ab_variant_id]);
    if (sentiment === 'positive' || sentiment === 'meeting_request') {
      await pool.execute('UPDATE ab_variants SET positive_replies = positive_replies + 1 WHERE id = ?', [rows[0].ab_variant_id]);
    }
  }

  // Auto-promote check
  await checkAutoPromote(rows[0]?.ab_variant_id);
}

async function checkAutoPromote(variantId) {
  if (!variantId) return;

  const [variants] = await pool.execute(
    'SELECT v.*, t.min_sends, t.id AS test_id FROM ab_variants v JOIN ab_tests t ON t.id = v.ab_test_id WHERE v.id = ?',
    [variantId]
  );
  if (variants.length === 0) return;

  const testId = variants[0].test_id;
  const minSends = variants[0].min_sends;

  const [allVariants] = await pool.execute(
    'SELECT * FROM ab_variants WHERE ab_test_id = ? ORDER BY variant_label',
    [testId]
  );

  // Both variants must have min_sends
  if (allVariants.some(v => v.sends < minSends)) return;

  // Check if one variant is 2x better on reply rate
  const rates = allVariants.map(v => ({
    ...v,
    replyRate: v.sends > 0 ? v.replies / v.sends : 0,
  }));

  rates.sort((a, b) => b.replyRate - a.replyRate);
  if (rates[0].replyRate >= rates[1].replyRate * 2 && rates[0].replyRate > 0) {
    console.log(`[A/B] Auto-promoting variant ${rates[0].variant_label} (${(rates[0].replyRate * 100).toFixed(1)}% vs ${(rates[1].replyRate * 100).toFixed(1)}%)`);
    // Auto-promote is logged but NOT auto-executed - flag for review
    // To auto-execute, uncomment the promote logic
  }
}

export default router;
