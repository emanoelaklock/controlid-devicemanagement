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
    const ips: string[] = [];
    if (range.includes('*')) {
      const parts = range.split('.');
      if (parts.indexOf('*') === 3) {
        for (let i = 1; i <= 254; i++) { parts[3] = String(i); ips.push(parts.join('.')); }
      }
    } else if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const startParts = startStr.trim().split('.').map(Number);
      const endLast = endStr.trim().includes('.') ? Number(endStr.trim().split('.')[3]) : Number(endStr.trim());
      for (let i = startParts[3]; i <= endLast; i++) {
        ips.push(`${startParts[0]}.${startParts[1]}.${startParts[2]}.${i}`);
      }
    } else {
      ips.push(range.trim());
    }
    return ips;
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
                last_heartbeat: authenticated ? new Date().toISOString() : null,
              };

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

    run(`UPDATE jobs SET status='completed', completed_at='${nowLocal()}', completed_items=?, progress=100 WHERE id=?`,
      [completed, jobId]);

    if (window && !window.isDestroyed()) {
      window.webContents.send('discovery:complete', { jobId, total: results.length });
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
