import { BrowserWindow } from 'electron';
import { v4 as uuid } from 'uuid';
import { query, queryOne, run, count, nowLocal } from '../db/queries';
import { jobService } from './job.service';
import { adapterRegistry } from '../adapters/registry';

/**
 * Daily scheduled tasks. Only one exists today: automatic configuration
 * backup of every device that has a credential, at a configured hour, with
 * per-device retention. Settings live in app_settings:
 *   backup_enabled   '0' | '1'
 *   backup_hour      '0'..'23'   (default 3)
 *   backup_retention '1'..'100'  backups kept per device (default 10)
 *   backup_last_run  'YYYY-MM-DD' of the last triggered run (internal)
 *
 * A plain 1-minute poll instead of cron: the app is a desktop program that
 * may not be running at the scheduled hour, so the semantics are "run once
 * per day, at or after the configured hour, whenever the app is open".
 */
export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;

  start(getWindow: () => BrowserWindow | null): void {
    this.timer = setInterval(() => this.tick(getWindow), 60_000);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  getSetting(key: string): string | null {
    return queryOne('SELECT value FROM app_settings WHERE key = ?', [key])?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    run(`INSERT INTO app_settings (key, value) VALUES (?,?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
  }

  private tick(getWindow: () => BrowserWindow | null): void {
    try {
      if (this.getSetting('backup_enabled') !== '1') return;
      const hour = Math.min(23, Math.max(0, parseInt(this.getSetting('backup_hour') ?? '3', 10) || 0));
      const today = nowLocal().slice(0, 10);
      if (new Date().getHours() < hour) return;
      if (this.getSetting('backup_last_run') === today) return;
      this.setSetting('backup_last_run', today);
      this.runScheduledBackup(getWindow);
    } catch (err) {
      console.error('[Scheduler] tick failed:', err);
    }
  }

  private runScheduledBackup(getWindow: () => BrowserWindow | null): void {
    const devices = query(`SELECT id FROM devices WHERE credential_id IS NOT NULL`);
    if (devices.length === 0) return;
    const retention = Math.min(100, Math.max(1, parseInt(this.getSetting('backup_retention') ?? '10', 10) || 10));

    run(`INSERT INTO audit_logs (id, action, category, details, severity, created_at) VALUES (?,?,?,?,?,?)`,
      [uuid(), 'scheduled_backup', 'config',
       `Scheduled backup started for ${devices.length} device(s) (retention: ${retention}/device)`, 'info', nowLocal()]);

    jobService.createJob('config_backup', `Scheduled backup of ${devices.length} device(s)`,
      devices.map((d: any) => d.id),
      async (conn, device) => {
        const adapter = adapterRegistry.get(device.manufacturer);
        if (!adapter) throw new Error('No adapter');
        const config = await adapter.getConfig(conn);
        if (Object.keys(config).length === 0) throw new Error('Device returned no configuration');
        const version = count('SELECT COUNT(*) as c FROM config_backups WHERE device_id = ?', [device.id]) + 1;
        run(`INSERT INTO config_backups (id, device_id, device_name, config, version) VALUES (?,?,?,?,?)`,
          [uuid(), device.id, device.name, JSON.stringify(config), version]);
        // Retention: keep only the newest N backups for this device
        run(`DELETE FROM config_backups WHERE device_id = ? AND id NOT IN
             (SELECT id FROM config_backups WHERE device_id = ? ORDER BY version DESC LIMIT ?)`,
          [device.id, device.id, retention]);
        return `Backup v${version} saved`;
      }, getWindow());
  }
}

export const schedulerService = new SchedulerService();
