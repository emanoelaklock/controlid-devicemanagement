import net from 'net';
import { BrowserWindow } from 'electron';
import { query, run } from '../db/queries';
import { saveDb } from '../db/database';

/**
 * Heartbeat monitor.
 * Uses raw TCP socket connection to check if devices are reachable.
 * This is the most reliable method - doesn't depend on HTTP responses,
 * authentication, or specific API endpoints. If TCP connects, device is up.
 */
export class HeartbeatService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private checking = false;

  start(getWindow: () => BrowserWindow | null, intervalMs = 10000): void {
    // Initial check after 3 seconds
    setTimeout(() => this.checkAll(getWindow), 3000);

    this.interval = setInterval(() => this.checkAll(getWindow), intervalMs);
    console.log(`[Heartbeat] Started (every ${intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async checkAll(getWindow: () => BrowserWindow | null): Promise<void> {
    // Prevent overlapping checks
    if (this.checking) return;
    this.checking = true;

    try {
      const devices = query('SELECT id, ip_address, port, status FROM devices');
      if (devices.length === 0) { this.checking = false; return; }

      let changed = false;

      const results = await Promise.allSettled(
        devices.map(async (device: any) => {
          const reachable = await this.tcpPing(device.ip_address, device.port, 3000);
          const newStatus = reachable ? 'online' : 'offline';

          if (reachable) {
            run(`UPDATE devices SET status='online', last_heartbeat=datetime('now'), updated_at=datetime('now') WHERE id=?`, [device.id]);
          } else if (device.status !== 'offline') {
            run(`UPDATE devices SET status='offline', updated_at=datetime('now') WHERE id=?`, [device.id]);
          }
          if (device.status !== newStatus) changed = true;

          return { id: device.id, status: newStatus };
        })
      );

      // Always save and notify
      saveDb();

      const win = getWindow();
      if (win && !win.isDestroyed()) {
        const statuses = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value);
        win.webContents.send('heartbeat:update', statuses);
      }

      if (changed) {
        console.log('[Heartbeat] Status changed:', results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => `${r.value.id.substring(0, 8)}=${r.value.status}`).join(', '));
      }
    } catch (err) {
      console.error('[Heartbeat] Error:', err);
    } finally {
      this.checking = false;
    }
  }

  /**
   * TCP ping - attempts to establish a TCP connection to the device.
   * If the connection succeeds within the timeout, the device is reachable.
   * This works regardless of HTTP/HTTPS, API version, or authentication.
   */
  private tcpPing(ip: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, ip);
    });
  }
}

export const heartbeatService = new HeartbeatService();
