import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { app as electronApp } from 'electron';
import { initDatabase } from './database';
import { authRouter } from './routes/auth.routes';
import { deviceRouter } from './routes/device.routes';
import { personRouter } from './routes/person.routes';
import { locationRouter } from './routes/location.routes';
import { accessRuleRouter } from './routes/accessRule.routes';
import { accessLogRouter } from './routes/accessLog.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { userRouter } from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import { DeviceMonitorService } from './services/deviceMonitor.service';

export async function startServer(port: number): Promise<void> {
  await initDatabase();

  const expressApp = express();

  expressApp.use(helmet({ contentSecurityPolicy: false }));
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '10mb' }));

  expressApp.use('/api/auth', authRouter);
  expressApp.use('/api/devices', deviceRouter);
  expressApp.use('/api/people', personRouter);
  expressApp.use('/api/locations', locationRouter);
  expressApp.use('/api/access-rules', accessRuleRouter);
  expressApp.use('/api/access-logs', accessLogRouter);
  expressApp.use('/api/dashboard', dashboardRouter);
  expressApp.use('/api/users', userRouter);

  expressApp.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve frontend
  const frontendPath = electronApp.isPackaged
    ? path.join(process.resourcesPath, 'frontend-dist')
    : path.join(__dirname, '..', '..', 'frontend', 'dist');

  expressApp.use(express.static(frontendPath));
  expressApp.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  expressApp.use(errorHandler);

  return new Promise((resolve) => {
    expressApp.listen(port, () => {
      console.log(`Server running on port ${port}`);
      const monitor = new DeviceMonitorService();
      monitor.start();
      resolve();
    });
  });
}
