import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { DiscoveryRequest, DiscoveredDevice } from '../types';
import { adapterRegistry } from '../adapters/registry';
import { query, queryOne, run, nowLocal } from '../db/queries';
import { decrypt } from '../utils/encryption';
import { saveDb } from '../db/database';

/**
 * Network discovery service.
 * Scans IP ranges, probes devices, auto-authenticates with default credentials,
 * and auto-adds discovered devices to the database.
 */
export class DiscoveryService {
  private activeScans = new Map<string, { cancelled: boolean }>();

  parseRange(range: string): string[] {
    const trimmed = range.trim();
    const ips: string[] = [];
    const MAX = 65536; // guard against an accidentally huge scan

    if (trimmed.includes('*')) {
      // Single "*" wildcard in any one octet (e.g. 192.168.1.* or 192.168.*.5).
      const parts = trimmed.split('.');
      if (parts.length !== 4 || parts.filter(p => p === '*').length !== 1 ||
          parts.some(p => p !== '*' && !this.isOctet(p))) {
        throw new Error(`Invalid range "${range}": use a single "*" in one octet, e.g. 192.168.1.*`);
      }
      const idx = parts.indexOf('*');
      for (let i = 1; i <= 254; i++) {
        const copy = parts.slice();
        copy[idx] = String(i);
        ips.push(copy.join('.'));
      }
    } else if (trimmed.includes('-')) {
      // Dash range: full-IP endpoints (any subnet span) or "start-lastOctet".
      const [startStr, endStr] = trimmed.split('-').map(s => s.trim());
      const start = this.ipToInt(startStr);
      const end = endStr.includes('.')
        ? this.ipToInt(endStr)
        : (this.isOctet(endStr) ? (((start & 0xffffff00) | Number(endStr)) >>> 0) : NaN);
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
        throw new Error(`Invalid range "${range}": expected forms like 192.168.1.10-254 or 192.168.1.10-192.168.2.20`);
      }
      if (end - start + 1 > MAX) {
        throw new Error(`Range "${range}" is too large (${end - start + 1} addresses); please narrow it down.`);
      }
      for (let i = start; i <= end; i++) ips.push(this.intToIp(i));
    } else {
      ips.push(trimmed);
    }
    return ips;
  }

  private isOctet(s: string): boolean {
    return /^\d{1,3}$/.test(s) && Number(s) >= 0 && Number(s) <= 255;
  }

  private ipToInt(ip: string): number {
    const p = ip.split('.');
    if (p.length !== 4 || !p.every(o => this.isOctet(o))) return NaN;
    return ((Number(p[0]) << 24) | (Number(p[1]) << 16) | (Number(p[2]) << 8) | Number(p[3])) >>> 0;
  }

  private intToIp(n: number): string {
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }

  async startScan(request: DiscoveryRequest, window: BrowserWindow | null): Promise<string> {
    const jobId = uuid();
    const allIps: string[] = [];
    for (const range of request.ranges) allIps.push(...this.parseRange(range));

    run(`INSERT INTO jobs (id, type, status, title, total_items) VALUES (?, 'discovery', 'running', ?, ?)`,
      [jobId, `Network scan: ${request.ranges.join(', ')}`, allIps.length]);

    const scanState = { cancelled: false };
    this.activeScans.set(jobId, scanState);

    this.executeScan(jobId, allIps, request, scanState, window).catch(err => {
      console.error('[Discovery] Scan failed:', err);
      run(`UPDATE jobs SET status='failed', completed_at='${nowLocal()}' WHERE id=?`, [jobId]);
    });

    return jobId;
  }

  cancelScan(jobId: string): void {
    const scan = this.activeScans.get(jobId);
    if (scan) {
      scan.cancelled = true;
      run(`UPDATE jobs SET status='cancelled', cancelled_at='${nowLocal()}' WHERE id=?`, [jobId]);
    }
  }

  private async executeScan(
    jobId: string, ips: string[], request: DiscoveryRequest,
    state: { cancelled: boolean }, window: BrowserWindow | null
  ): Promise<void> {
    const adapters = adapterRegistry.getAll();
    const results: DiscoveredDevice[] = [];
    let completed = 0;

    // Get all credentials (default first)
    const credentials = query('SELECT * FROM credentials ORDER BY is_default DESC, created_at ASC');

    const concurrency = request.concurrency || 20;
    const chunks = this.chunkArray(ips, concurrency);

    for (const chunk of chunks) {
      if (state.cancelled) break;

      const promises = chunk.flatMap(ip =>
        request.ports.map(async port => {
          if (state.cancelled) return;

          for (const adapter of adapters) {
            try {
              const device = await adapter.probe(ip, port, request.timeout || 3000);
              if (!device) continue;

              // Check if already managed
              const existing = query('SELECT id FROM devices WHERE ip_address = ?', [ip]);
              if (existing.length > 0) {
                device.alreadyManaged = true;
                device.existingDeviceId = existing[0].id;
                results.push(device);
                if (window && !window.isDestroyed()) {
                  window.webContents.send('discovery:device-found', { ...device, autoAdded: false, authStatus: 'already_managed' });
                }
                break;
              }

              // Try auto-authenticate with each credential
              let authenticated = false;
              let usedCredentialId: string | null = null;
              let fullInfo: any = null;

              for (const cred of credentials) {
                try {
                  const password = decrypt(cred.password);
                  const info = await adapter.authenticate(ip, port, cred.username, password);
                  if (info) {
                    authenticated = true;
                    usedCredentialId = cred.id;
                    fullInfo = info;
                    break;
                  }
                } catch { /* try next credential */ }
              }

              // Auto-add device to database
              const deviceId = uuid();
              const deviceData: any = {
                id: deviceId,
                name: (fullInfo?.model || device.model || 'Control iD Device') + ' - ' + ip,
                ip_address: ip,
                port: port,
                manufacturer: device.manufacturer || 'controlid',
                model: fullInfo?.model || device.model || '',
                serial_number: fullInfo?.serialNumber || device.serialNumber || '',
                mac_address: fullInfo?.macAddress || device.macAddress || null,
                firmware_version: fullInfo?.firmwareVersion || device.firmwareVersion || null,
                hostname: fullInfo?.hostname || device.hostname || null,
                status: authenticated ? 'online' : 'unknown',
                https_enabled: (fullInfo?.httpsEnabled || device.httpsEnabled) ? 1 : 0,
                dhcp_enabled: fullInfo?.dhcpEnabled ? 1 : 0,
                credential_id: usedCredentialId,
                last_heartbeat: authenticated ? nowLocal() : null,
              };

              // Final synchronous existence check before inserting: sibling tasks
              // for the same IP on different ports (e.g. 80 and 443) interleave
              // across the awaits above. sql.js is synchronous, so nothing can slip
              // between this SELECT and the INSERT — this closes the duplicate race.
              const dupe = query('SELECT id FROM devices WHERE ip_address = ?', [ip]);
              if (dupe.length > 0) break;

              // Insert into DB
              const cols = Object.keys(deviceData).join(',');
              const placeholders = Object.keys(deviceData).map(() => '?').join(',');
              run(`INSERT INTO devices (${cols}) VALUES (${placeholders})`, Object.values(deviceData));

              // Audit log
              run(`INSERT INTO audit_logs (id, action, category, device_id, device_name, details, severity) VALUES (?,?,?,?,?,?,?)`,
                [uuid(), 'device_discovered', 'device', deviceId, deviceData.name,
                 authenticated ? `Auto-added with credential, MAC: ${deviceData.mac_address || 'N/A'}` : 'Added without authentication',
                 'info']);

              device.alreadyManaged = true;
              device.existingDeviceId = deviceId;
              results.push(device);

              // Notify renderer with full details
              if (window && !window.isDestroyed()) {
                window.webContents.send('discovery:device-found', {
                  ...device,
                  model: fullInfo?.model || device.model,
                  macAddress: fullInfo?.macAddress || device.macAddress,
                  firmwareVersion: fullInfo?.firmwareVersion || device.firmwareVersion,
                  serialNumber: fullInfo?.serialNumber || device.serialNumber,
                  autoAdded: true,
                  authStatus: authenticated ? 'authenticated' : 'auth_failed',
                  credentialName: authenticated ? credentials.find(c => c.id === usedCredentialId)?.name : null,
                  deviceId,
                });
              }

              saveDb();
              break;
            } catch { /* skip */ }
          }

          completed++;
          if (window && !window.isDestroyed()) {
            window.webContents.send('discovery:progress', {
              jobId, completed, total: ips.length,
              progress: Math.round((completed / ips.length) * 100),
              found: results.length,
            });
          }
        })
      );

      await Promise.allSettled(promises);
    }

    // Don't overwrite a 'cancelled' status the user just set with 'completed'.
    const finalStatus = state.cancelled ? 'cancelled' : 'completed';
    const finalProgress = state.cancelled && ips.length > 0
      ? Math.round((completed / ips.length) * 100) : 100;
    run(`UPDATE jobs SET status=?, completed_at='${nowLocal()}', completed_items=?, progress=? WHERE id=?`,
      [finalStatus, completed, finalProgress, jobId]);

    if (window && !window.isDestroyed()) {
      window.webContents.send('discovery:complete', { jobId, total: results.length, cancelled: state.cancelled });
    }

    this.activeScans.delete(jobId);
    run(`INSERT INTO audit_logs (id, action, category, details, severity) VALUES (?, ?, 'system', ?, 'info')`,
      [uuid(), 'discovery_scan', `Scanned ${ips.length} IPs, found ${results.length} devices`]);
    saveDb();
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }
}

export const discoveryService = new DiscoveryService();
