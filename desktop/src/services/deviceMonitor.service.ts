import cron from 'node-cron';
import { query, run } from '../utils/db-helpers';
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
    const devices = query('SELECT * FROM devices');
    for (const device of devices) {
      try {
        const api = new ControlIdService(device.ip_address, device.port, device.login, decrypt(device.password));
        const isOnline = await api.ping();
        const newStatus = isOnline ? 'ONLINE' : 'OFFLINE';
        if (isOnline) {
          run("UPDATE devices SET status=?, last_heartbeat=datetime('now') WHERE id=?", [newStatus, device.id]);
        } else {
          run("UPDATE devices SET status=? WHERE id=?", [newStatus, device.id]);
        }
      } catch {
        run("UPDATE devices SET status='ERROR' WHERE id=?", [device.id]);
      }
    }
  }
}
