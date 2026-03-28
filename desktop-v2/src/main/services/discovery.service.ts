import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { DiscoveryRequest, DiscoveredDevice } from '../types';
import { adapterRegistry } from '../adapters/registry';
import { query, run } from '../db/queries';

/**
 * Network discovery service.
 * Scans IP ranges for devices using registered adapters.
 * Runs in the main process, sends progress via IPC to renderer.
 */
export class DiscoveryService {
  private activeScans = new Map<string, { cancelled: boolean }>();

  /**
   * Parse IP range string into list of IPs.
   * Supports: "192.168.1.1-192.168.1.254", "192.168.1.*", "10.0.0.100"
   */
  parseRange(range: string): string[] {
    const ips: string[] = [];

    if (range.includes('*')) {
      // Wildcard: 192.168.1.*
      const parts = range.split('.');
      const wildcardIdx = parts.indexOf('*');
      if (wildcardIdx === 3) {
        for (let i = 1; i <= 254; i++) {
          parts[3] = String(i);
          ips.push(parts.join('.'));
        }
      }
    } else if (range.includes('-')) {
      // Range: 192.168.1.1-192.168.1.254 or 192.168.1.1-254
      const [startStr, endStr] = range.split('-');
      const startParts = startStr.trim().split('.').map(Number);

      let endLast: number;
      if (endStr.trim().includes('.')) {
        endLast = Number(endStr.trim().split('.')[3]);
      } else {
        endLast = Number(endStr.trim());
      }

      for (let i = startParts[3]; i <= endLast; i++) {
        ips.push(`${startParts[0]}.${startParts[1]}.${startParts[2]}.${i}`);
      }
    } else {
      // Single IP
      ips.push(range.trim());
    }

    return ips;
  }

  /**
   * Start a discovery scan. Returns job ID immediately.
   * Scan runs asynchronously, sending progress events to renderer.
   */
  async startScan(request: DiscoveryRequest, window: BrowserWindow | null): Promise<string> {
    const jobId = uuid();
    const allIps: string[] = [];

    for (const range of request.ranges) {
      allIps.push(...this.parseRange(range));
    }

    // Create job record
    run(`INSERT INTO jobs (id, type, status, title, total_items) VALUES (?, 'discovery', 'running', ?, ?)`,
      [jobId, `Network scan: ${request.ranges.join(', ')}`, allIps.length]);

    const scanState = { cancelled: false };
    this.activeScans.set(jobId, scanState);

    // Run scan asynchronously
    this.executeScan(jobId, allIps, request, scanState, window).catch(err => {
      console.error('[Discovery] Scan failed:', err);
      run(`UPDATE jobs SET status='failed', completed_at=datetime('now') WHERE id=?`, [jobId]);
    });

    return jobId;
  }

  cancelScan(jobId: string): void {
    const scan = this.activeScans.get(jobId);
    if (scan) {
      scan.cancelled = true;
      run(`UPDATE jobs SET status='cancelled', cancelled_at=datetime('now') WHERE id=?`, [jobId]);
    }
  }

  private async executeScan(
    jobId: string,
    ips: string[],
    request: DiscoveryRequest,
    state: { cancelled: boolean },
    window: BrowserWindow | null
  ): Promise<void> {
    const adapters = adapterRegistry.getAll();
    const results: DiscoveredDevice[] = [];
    let completed = 0;

    // Process IPs with controlled concurrency
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
              if (device) {
                // Check if already managed
                const existing = query('SELECT id FROM devices WHERE ip_address = ?', [ip]);
                if (existing.length > 0) {
                  device.alreadyManaged = true;
                  device.existingDeviceId = existing[0].id;
                }
                results.push(device);
                break; // Found a match, skip other adapters
              }
            } catch { /* skip */ }
          }

          completed++;
          const progress = Math.round((completed / ips.length) * 100);
          run(`UPDATE jobs SET completed_items=?, progress=? WHERE id=?`, [completed, progress, jobId]);

          // Send progress to renderer
          if (window && !window.isDestroyed()) {
            window.webContents.send('discovery:progress', {
              jobId, completed, total: ips.length, progress, found: results.length,
            });
          }
        })
      );

      await Promise.allSettled(promises);
    }

    // Complete
    run(`UPDATE jobs SET status='completed', completed_at=datetime('now'), completed_items=?, progress=100 WHERE id=?`,
      [completed, jobId]);

    if (window && !window.isDestroyed()) {
      window.webContents.send('discovery:complete', { jobId, devices: results });
    }

    this.activeScans.delete(jobId);

    // Audit
    run(`INSERT INTO audit_logs (id, action, category, details, severity) VALUES (?, ?, 'system', ?, 'info')`,
      [uuid(), 'discovery_scan', `Scanned ${ips.length} IPs, found ${results.length} devices`]);
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}

export const discoveryService = new DiscoveryService();
