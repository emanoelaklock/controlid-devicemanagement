import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { Job, JobItem, JobType, DeviceConnection } from '../types';
import { query, queryOne, run } from '../db/queries';
import { adapterRegistry } from '../adapters/registry';
import { decrypt } from '../utils/encryption';

/**
 * Job/task queue service.
 * Executes batch operations on devices with progress tracking,
 * cancellation support, and error handling per device.
 */
export class JobService {
  private activeJobs = new Map<string, { cancelled: boolean }>();

  async createJob(
    type: JobType,
    title: string,
    deviceIds: string[],
    executor: (conn: DeviceConnection, device: any) => Promise<string | null>,
    window: BrowserWindow | null
  ): Promise<string> {
    const jobId = uuid();

    run(`INSERT INTO jobs (id, type, status, title, total_items, started_at) VALUES (?,?,'running',?,?,datetime('now','localtime'))`,
      [jobId, type, title, deviceIds.length]);

    // Create job items
    for (const deviceId of deviceIds) {
      run(`INSERT INTO job_items (id, job_id, device_id, status) VALUES (?,?,?,'pending')`,
        [uuid(), jobId, deviceId]);
    }

    const state = { cancelled: false };
    this.activeJobs.set(jobId, state);

    // Execute async
    this.executeJob(jobId, deviceIds, executor, state, window).catch(err => {
      console.error(`[Job ${jobId}] Failed:`, err);
      run(`UPDATE jobs SET status='failed', completed_at=datetime('now','localtime') WHERE id=?`, [jobId]);
    });

    return jobId;
  }

  cancelJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.cancelled = true;
      run(`UPDATE jobs SET status='cancelled', cancelled_at=datetime('now','localtime') WHERE id=?`, [jobId]);
    }
  }

  getJob(jobId: string): { job: Job; items: JobItem[] } | null {
    const job = queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) return null;
    const items = query('SELECT * FROM job_items WHERE job_id = ?', [jobId]);
    return { job, items };
  }

  listJobs(): Job[] {
    return query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100');
  }

  private async executeJob(
    jobId: string,
    deviceIds: string[],
    executor: (conn: DeviceConnection, device: any) => Promise<string | null>,
    state: { cancelled: boolean },
    window: BrowserWindow | null
  ): Promise<void> {
    let completed = 0;
    let failed = 0;

    for (const deviceId of deviceIds) {
      if (state.cancelled) break;

      const device = queryOne('SELECT d.*, c.username, c.password as cred_password FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?', [deviceId]);
      if (!device) {
        failed++;
        run(`UPDATE job_items SET status='skipped', message='Device not found' WHERE job_id=? AND device_id=?`, [jobId, deviceId]);
        continue;
      }

      run(`UPDATE job_items SET status='running', started_at=datetime('now','localtime') WHERE job_id=? AND device_id=?`, [jobId, deviceId]);

      try {
        const conn: DeviceConnection = {
          ip: device.ip_address,
          port: device.port,
          username: device.username || 'admin',
          password: device.cred_password ? decrypt(device.cred_password) : '',
        };

        const message = await executor(conn, device);
        completed++;

        run(`UPDATE job_items SET status='success', message=?, completed_at=datetime('now','localtime') WHERE job_id=? AND device_id=?`,
          [message, jobId, deviceId]);
      } catch (err: any) {
        failed++;
        run(`UPDATE job_items SET status='failed', message=?, completed_at=datetime('now','localtime') WHERE job_id=? AND device_id=?`,
          [err.message || 'Unknown error', jobId, deviceId]);
      }

      const progress = Math.round(((completed + failed) / deviceIds.length) * 100);
      run(`UPDATE jobs SET completed_items=?, failed_items=?, progress=? WHERE id=?`,
        [completed, failed, progress, jobId]);

      if (window && !window.isDestroyed()) {
        window.webContents.send('job:progress', { jobId, completed, failed, total: deviceIds.length, progress });
      }
    }

    const finalStatus = state.cancelled ? 'cancelled' : (failed === deviceIds.length ? 'failed' : 'completed');
    run(`UPDATE jobs SET status=?, completed_at=datetime('now','localtime'), progress=100 WHERE id=?`, [finalStatus, jobId]);

    if (window && !window.isDestroyed()) {
      window.webContents.send('job:complete', { jobId, status: finalStatus, completed, failed });
    }

    this.activeJobs.delete(jobId);
  }
}

export const jobService = new JobService();
