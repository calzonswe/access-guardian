import express from 'express';
import cors from 'cors';
import { pool, initDb } from './db.js';
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
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Public routes
app.use('/api/auth', authRoutes);

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

initDb().then(() => {
  app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
