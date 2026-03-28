import http from 'http';
import https from 'https';
import { BrowserWindow } from 'electron';
import { query, run } from '../db/queries';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Lightweight heartbeat monitor.
 * Pings all managed devices every N seconds via a simple HTTP HEAD/GET
 * and updates their status without requiring authentication.
 */
export class HeartbeatService {
  private interval: ReturnType<typeof setInterval> | null = null;

  start(window: () => BrowserWindow | null, intervalMs = 10000): void {
    // Initial check after 2 seconds
    setTimeout(() => this.checkAll(window), 2000);

    this.interval = setInterval(() => this.checkAll(window), intervalMs);
    console.log(`[Heartbeat] Started (every ${intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async checkAll(getWindow: () => BrowserWindow | null): Promise<void> {
    const devices = query('SELECT id, ip_address, port, status FROM devices');
    if (devices.length === 0) return;

    const results = await Promise.allSettled(
      devices.map(async (device: any) => {
        const reachable = await this.ping(device.ip_address, device.port, 3000);
        const newStatus = reachable ? 'online' : 'offline';

        if (device.status !== newStatus) {
          run(`UPDATE devices SET status=?, last_heartbeat=CASE WHEN ?='online' THEN datetime('now') ELSE last_heartbeat END, updated_at=datetime('now') WHERE id=?`,
            [newStatus, newStatus, device.id]);
        } else if (reachable) {
          run(`UPDATE devices SET last_heartbeat=datetime('now') WHERE id=?`, [device.id]);
        }

        return { id: device.id, status: newStatus };
      })
    );

    // Notify renderer
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      const statuses = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
      win.webContents.send('heartbeat:update', statuses);
    }
  }

  /**
   * Quick reachability check - just tries to establish TCP connection
   * and get any HTTP response from the device.
   */
  private ping(ip: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const mod = port === 443 ? https : http;
      const options: https.RequestOptions = {
        hostname: ip,
        port,
        path: '/',
        method: 'HEAD',
        timeout: timeoutMs,
        ...(port === 443 ? { agent: httpsAgent } : {}),
      };

      const req = mod.request(options, (res) => {
        res.resume(); // consume response
        resolve(true);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }
}

export const heartbeatService = new HeartbeatService();
