// A/B test results for the partner cadences (behind login).  GET /api/cadence-ab?all=1 includes ended tests.
import { Router } from 'express';
import { abResults } from '../services/cadenceAb.js';

const router = Router();
router.get('/', async (req, res) => {
  try { res.json(await abResults({ includeEnded: req.query.all === '1' })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
export default router;
