import cron from 'node-cron';
import { PrismaClient, DeviceStatus } from '@prisma/client';
import { ControlIdService } from './controlid.service';
import { logger } from '../config/logger';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

export class DeviceMonitorService {
  private task: cron.ScheduledTask | null = null;

  start(): void {
    this.task = cron.schedule('*/2 * * * *', async () => {
      await this.checkAllDevices();
    });
    logger.info('Device monitor started (every 2 minutes)');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Device monitor stopped');
    }
  }

  async checkAllDevices(): Promise<void> {
    const devices = await prisma.device.findMany();

    const results = await Promise.allSettled(
      devices.map(async (device) => {
        try {
          const decryptedPassword = decrypt(device.password);
          const api = new ControlIdService(
            device.ipAddress,
            device.port,
            device.login,
            decryptedPassword
          );

          const isOnline = await api.ping();
          const newStatus: DeviceStatus = isOnline ? 'ONLINE' : 'OFFLINE';

          await prisma.device.update({
            where: { id: device.id },
            data: {
              status: newStatus,
              lastHeartbeat: isOnline ? new Date() : device.lastHeartbeat,
            },
          });

          if (device.status !== newStatus) {
            logger.info(`Device ${device.name} (${device.ipAddress}) status changed: ${device.status} -> ${newStatus}`);
          }
        } catch (error) {
          logger.error(`Error checking device ${device.name}:`, error);
          await prisma.device.update({
            where: { id: device.id },
            data: { status: 'ERROR' },
          });
        }
      })
    );

    const online = results.filter(
      (r) => r.status === 'fulfilled'
    ).length;
    logger.debug(`Device check complete: ${online}/${devices.length} checked`);
  }
}
