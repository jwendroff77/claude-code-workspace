import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

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
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

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

app.listen(PORT, () => {
  console.log(`1Cloud API running on port ${PORT}`);
  startScheduler();
});
