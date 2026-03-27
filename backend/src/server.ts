import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';
import { deviceRouter } from './routes/device.routes';
import { personRouter } from './routes/person.routes';
import { locationRouter } from './routes/location.routes';
import { accessRuleRouter } from './routes/accessRule.routes';
import { accessLogRouter } from './routes/accessLog.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { userRouter } from './routes/user.routes';
import { DeviceMonitorService } from './services/deviceMonitor.service';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use('/api/auth', authRouter);
app.use('/api/devices', deviceRouter);
app.use('/api/people', personRouter);
app.use('/api/locations', locationRouter);
app.use('/api/access-rules', accessRuleRouter);
app.use('/api/access-logs', accessLogRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/users', userRouter);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.use(errorHandler);

const server = app.listen(port, () => {
  logger.info(`Server running on port ${port}`);

  const monitor = new DeviceMonitorService();
  monitor.start();
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});

export { app, prisma };
