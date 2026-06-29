import express from 'express';
import cors from 'cors';
import { pool, initDb } from './db.js';
import { runMigrations } from './migrations.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import facilitiesRoutes from './routes/facilities.js';
import areasRoutes from './routes/areas.js';
import requirementsRoutes from './routes/requirements.js';
import applicationsRoutes from './routes/applications.js';
import logsRoutes from './routes/logs.js';
import notificationsRoutes from './routes/notifications.js';
import orgRoutes from './routes/org.js';
import userRequirementsRoutes from './routes/userRequirements.js';
import facilityRequirementsRoutes from './routes/facilityRequirements.js';
import areaRequirementsRoutes from './routes/areaRequirements.js';
import settingsRoutes from './routes/settings.js';
import attachmentsRoutes from './routes/attachments.js';
import contractorRoutes from './routes/contractor.js';
import { authMiddleware } from './middleware/auth.js';
import { createRateLimit } from './middleware/rateLimit.js';
import { startExpiryScheduler, runExpiryJob, getExpiryStats } from './jobs/expiryJob.js';
import { getEmailStatus } from './services/email.js';
import { logger } from './services/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // honor X-Forwarded-For from nginx

// CORS: restrict origin in production
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check (both paths for nginx proxy and direct access)
async function healthHandler(_req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// General API rate limit (per user-id when authenticated, otherwise per IP).
// Generous default: 600 requests / minute. Override via API_RATE_LIMIT_MAX.
const apiRateMax = parseInt(process.env.API_RATE_LIMIT_MAX || '600', 10);
const apiRateWindowMs = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10);
app.use('/api/', createRateLimit({ windowMs: apiRateWindowMs, max: apiRateMax }));

// Public routes
app.use('/api/auth', authRoutes);

// Public contractor application flow — stricter rate limit (20 req/h per IP)
app.use('/api/contractor',
  createRateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
  contractorRoutes
);

// Protected routes
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/facilities', authMiddleware, facilitiesRoutes);
app.use('/api/areas', authMiddleware, areasRoutes);
app.use('/api/requirements', authMiddleware, requirementsRoutes);
app.use('/api/applications', authMiddleware, applicationsRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
app.use('/api/notifications', authMiddleware, notificationsRoutes);
app.use('/api/org', authMiddleware, orgRoutes);
app.use('/api/user-requirements', authMiddleware, userRequirementsRoutes);
app.use('/api/facility-requirements', authMiddleware, facilityRequirementsRoutes);
app.use('/api/area-requirements', authMiddleware, areaRequirementsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/attachments', authMiddleware, attachmentsRoutes);

// Admin: trigger expiry job on demand
app.post('/api/admin/run-expiry-job', authMiddleware, async (req, res) => {
  if (!req.user.roles.includes('administrator')) {
    return res.status(403).json({ error: 'Otillräckliga rättigheter' });
  }
  try {
    await runExpiryJob();
    res.json({ success: true, stats: getExpiryStats() });
  } catch {
    res.status(500).json({ error: 'Kunde inte köra expiry-jobbet' });
  }
});

// Admin: aggregated system status (DB, SMTP, expiry job, build info)
app.get('/api/admin/system-status', authMiddleware, async (req, res) => {
  if (!req.user.roles.includes('administrator')) {
    return res.status(403).json({ error: 'Otillräckliga rättigheter' });
  }
  let db = { ok: false };
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    db = { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    db = { ok: false, error: err.message };
  }
  res.json({
    db,
    email: getEmailStatus(),
    expiryJob: getExpiryStats(),
    server: {
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || null,
    },
  });
});

initDb().then(async () => {
  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migrations failed at startup', { err });
    process.exit(1);
  }
  const server = app.listen(PORT, () => logger.info('Backend listening', { port: PORT }));
  startExpiryScheduler();

  // Graceful shutdown
  const shutdown = (sig) => {
    logger.info('Shutting down', { signal: sig });
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(err => {
  logger.error('Failed to initialize database', { err });
  process.exit(1);
});

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { err });
  res.status(500).json({ error: 'Internt serverfel' });
});
