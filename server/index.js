import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/authMiddleware.js';
import agentRoutes from './routes/agents.js';
import prospectRoutes from './routes/prospects.js';
import sequenceRoutes from './routes/sequences.js';
import inboxRoutes from './routes/inbox.js';
import pipelineRoutes from './routes/pipeline.js';
import apolloRoutes from './routes/apollo.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import partnerCadenceRoutes from './routes/partnerCadence.js';
import unsubscribeRoutes from './routes/unsubscribe.js';
import trackingRoutes from './routes/tracking.js';
import analyticsRoutes from './routes/analytics.js';
import abRoutes from './routes/ab.js';
import taskRoutes from './routes/tasks.js';
import signalIntelRoutes from './routes/signalIntel.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Auth route — public
app.use('/api/auth', authRoutes);

// All other API routes require a valid JWT
app.use('/api', requireAuth);

app.use('/api/agents', agentRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/sequences', sequenceRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/apollo', apolloRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/partner-cadence', partnerCadenceRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ab', abRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/signal-intel', signalIntelRoutes);

// Serve React build in production
const clientDist = join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(clientDist, 'index.html'));
    }
  });
}

// Add any DB columns that exist locally but were never in a migration file.
// MySQL doesn't support ADD COLUMN IF NOT EXISTS, so we catch the duplicate-column error.
async function runSchemaPatches() {
  const patches = [
    "ALTER TABLE sent_emails ADD COLUMN to_email VARCHAR(255) DEFAULT NULL AFTER agent_id",
    "ALTER TABLE received_emails ADD COLUMN cc_emails TEXT DEFAULT NULL AFTER from_email",
    // When a step's copy says a partner is CC'd, this flag makes the send actually CC them.
    "ALTER TABLE sequence_steps ADD COLUMN cc_partner TINYINT(1) NOT NULL DEFAULT 0",
    // Which ICP vertical a signal-intel lead came from; routes weekly auto-staging to a partner.
    "ALTER TABLE signal_intel_leads ADD COLUMN vertical VARCHAR(40) DEFAULT NULL",
  ];
  const { default: pool } = await import('./db/connection.js');
  for (const sql of patches) {
    try {
      await pool.execute(sql);
      console.log('[SCHEMA] Applied patch:', sql.slice(0, 60));
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.error('[SCHEMA] Patch failed:', e.message, '|', sql.slice(0, 60));
      }
    }
  }
}

app.listen(PORT, async () => {
  console.log(`1Cloud API running on port ${PORT}`);
  console.log(`[STARTUP] PID: ${process.pid}`);
  await runSchemaPatches();
  startScheduler();
});
