import net from 'net';
import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { query, queryOne, run, nowLocal } from '../db/queries';
import { saveDb } from '../db/database';
import { adapterRegistry } from '../adapters/registry';

/**
 * Heartbeat monitor with DHCP IP tracking.
 * - TCP pings all devices every N seconds
 * - When a DHCP device goes offline, scans the subnet to find it by MAC
 * - Updates IP address when device is found on a new IP
 */
export class HeartbeatService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private checking = false;
  private offlineCounters = new Map<string, number>(); // deviceId -> consecutive offline count

  start(getWindow: () => BrowserWindow | null, intervalMs = 5000): void {
    setTimeout(() => this.checkAll(getWindow), 3000);
    this.interval = setInterval(() => this.checkAll(getWindow), intervalMs);
    console.log(`[Heartbeat] Started (every ${intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  private async checkAll(getWindow: () => BrowserWindow | null): Promise<void> {
    if (this.checking) return;
    this.checking = true;

    try {
      const devices = query('SELECT id, ip_address, port, status, mac_address, dhcp_enabled FROM devices');
      if (devices.length === 0) { this.checking = false; return; }

      let changed = false;

      const results = await Promise.allSettled(
        devices.map(async (device: any) => {
          const reachable = await this.tcpPing(device.ip_address, device.port, 3000);

          if (reachable) {
            this.offlineCounters.delete(device.id);
            if (device.status !== 'online') {
              const ts = nowLocal();
              run(`UPDATE devices SET status='online', last_heartbeat=?, updated_at=? WHERE id=?`, [ts, ts, device.id]);
              run(`INSERT INTO connection_history (id, device_id, event, timestamp) VALUES (?, ?, 'online', ?)`, [uuid(), device.id, ts]);
              changed = true;
            } else {
              run(`UPDATE devices SET last_heartbeat=? WHERE id=?`, [nowLocal(), device.id]);
            }
            return { id: device.id, status: 'online' };
          }

          // Device is offline
          const offlineCount = (this.offlineCounters.get(device.id) || 0) + 1;
          this.offlineCounters.set(device.id, offlineCount);

          if (device.status !== 'offline') {
            const ts2 = nowLocal();
            run(`UPDATE devices SET status='offline', updated_at=? WHERE id=?`, [ts2, device.id]);
            run(`INSERT INTO connection_history (id, device_id, event, timestamp) VALUES (?, ?, 'offline', ?)`, [uuid(), device.id, ts2]);
            changed = true;
          }

          // If device is offline for 3+ cycles and has a MAC, try to find new IP
          // Works for both DHCP and manual IP changes (via web interface)
          if (device.mac_address && offlineCount >= 3 && offlineCount % 6 === 0) {
            console.log(`[Heartbeat] Device ${device.mac_address} offline for ${offlineCount} cycles, scanning for new IP...`);
            this.findDeviceByMac(device).catch(() => {});
          }

          return { id: device.id, status: 'offline' };
        })
      );

      saveDb();

      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('heartbeat:update',
          results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map(r => r.value));
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
   * Scan the device's subnet to find it on a new IP (DHCP IP change).
   * Uses the device's MAC address to identify it.
   */
  private async findDeviceByMac(device: any): Promise<void> {
    const oldIp = device.ip_address;
    const subnet = oldIp.split('.').slice(0, 3).join('.');
    const adapter = adapterRegistry.getAll()[0]; // Use first adapter for probing
    if (!adapter) return;

    // Scan subnet in parallel batches
    const ips: string[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      if (ip !== oldIp) ips.push(ip);
    }

    // Check 30 IPs at a time
    for (let i = 0; i < ips.length; i += 30) {
      const batch = ips.slice(i, i + 30);
      const results = await Promise.allSettled(
        batch.map(async (ip) => {
          const found = await adapter.probe(ip, device.port, 2000);
          if (found && found.macAddress?.toUpperCase() === device.mac_address?.toUpperCase()) {
            return ip;
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const newIp = result.value;
          console.log(`[Heartbeat] Found ${device.mac_address} at new IP: ${newIp} (was ${oldIp})`);
          const ts3 = nowLocal();
          run(`UPDATE devices SET ip_address=?, status='online', last_heartbeat=?, updated_at=? WHERE id=?`,
            [newIp, ts3, ts3, device.id]);
          run(`INSERT INTO audit_logs (id, action, category, device_id, device_name, details, severity) VALUES (?,?,?,?,?,?,?)`,
            [require('uuid').v4(), 'ip_changed', 'device', device.id, device.name,
             `DHCP IP changed: ${oldIp} -> ${newIp}`, 'warning']);
          this.offlineCounters.delete(device.id);
          saveDb();
          return;
        }
      }
    }
  }

  private tcpPing(ip: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, ip);
    });
  }
}

export const heartbeatService = new HeartbeatService();
