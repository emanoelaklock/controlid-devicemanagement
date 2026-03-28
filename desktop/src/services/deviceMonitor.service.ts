import cron from 'node-cron';
import { prisma } from '../database';
import { ControlIdService } from './controlid.service';
import { decrypt } from '../utils/encryption';

export class DeviceMonitorService {
  private task: cron.ScheduledTask | null = null;

  start(): void {
    this.task = cron.schedule('*/2 * * * *', () => { this.checkAllDevices(); });
    console.log('Device monitor started (every 2 minutes)');
  }

  stop(): void {
    if (this.task) { this.task.stop(); this.task = null; }
  }

  async checkAllDevices(): Promise<void> {
    const devices = await prisma.device.findMany();
    for (const device of devices) {
      try {
        const api = new ControlIdService(device.ipAddress, device.port, device.login, decrypt(device.password));
        const isOnline = await api.ping();
        const newStatus = isOnline ? 'ONLINE' : 'OFFLINE';
        await prisma.device.update({
          where: { id: device.id },
          data: { status: newStatus, lastHeartbeat: isOnline ? new Date() : device.lastHeartbeat },
        });
      } catch {
        await prisma.device.update({ where: { id: device.id }, data: { status: 'ERROR' } });
      }
    }
  }
}
