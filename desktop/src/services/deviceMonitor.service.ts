import cron from 'node-cron';
import { getDb } from '../database';
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
    const db = getDb();
    const devices = db.prepare('SELECT * FROM devices').all() as any[];
    for (const device of devices) {
      try {
        const api = new ControlIdService(device.ip_address, device.port, device.login, decrypt(device.password));
        const isOnline = await api.ping();
        const newStatus = isOnline ? 'ONLINE' : 'OFFLINE';
        db.prepare(`UPDATE devices SET status = ?, last_heartbeat = CASE WHEN ? = 'ONLINE' THEN datetime('now') ELSE last_heartbeat END WHERE id = ?`)
          .run(newStatus, newStatus, device.id);
      } catch {
        db.prepare("UPDATE devices SET status = 'ERROR' WHERE id = ?").run(device.id);
      }
    }
  }
}
