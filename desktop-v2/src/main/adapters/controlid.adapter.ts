import https from 'https';
import http from 'http';
import { DeviceAdapter, DeviceConnection, DeviceInfo, DiscoveredDevice } from '../types';

// Agent that ignores self-signed certificates (Control iD devices use self-signed SSL)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Control iD device adapter.
 * API reference: Control iD RESTful API (login.fcgi, load_objects.fcgi, etc.)
 */
export class ControlIdAdapter implements DeviceAdapter {
  readonly manufacturer = 'controlid';

  async probe(ip: string, port: number, timeoutMs: number): Promise<DiscoveredDevice | null> {
    const start = Date.now();

    // Try HTTPS first, then HTTP
    const protocols = port === 80 ? ['http'] : ['https', 'http'];

    for (const proto of protocols) {
      try {
        const data = await this.httpRequest(proto, ip, port, '/system_information.fcgi', '{}', timeoutMs);
        if (!data) continue;

        const elapsed = Date.now() - start;
        return {
          ipAddress: ip,
          port,
          macAddress: data.mac ?? null,
          hostname: data.hostname ?? null,
          manufacturer: 'controlid',
          model: data.model ?? data.product ?? null,
          serialNumber: data.serial ?? null,
          firmwareVersion: data.firmware ?? data.version ?? null,
          httpsEnabled: proto === 'https',
          responseTimeMs: elapsed,
          alreadyManaged: false,
          existingDeviceId: null,
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  async authenticate(ip: string, port: number, username: string, password: string): Promise<DeviceInfo | null> {
    try {
      const loginRes = await this.apiRequest(ip, port, '/login.fcgi', { login: username, password });
      if (!loginRes?.session) return null;

      const info = await this.apiRequest(ip, port, '/system_information.fcgi', {}, loginRes.session);
      await this.apiRequest(ip, port, '/logout.fcgi', {}, loginRes.session).catch(() => {});

      return {
        manufacturer: 'controlid',
        model: info?.model ?? info?.product ?? 'Unknown',
        serialNumber: info?.serial ?? '',
        macAddress: info?.mac ?? null,
        firmwareVersion: info?.firmware ?? info?.version ?? 'Unknown',
        hostname: info?.hostname ?? null,
        httpsEnabled: true,
        dhcpEnabled: !!info?.dhcp,
      };
    } catch {
      return null;
    }
  }

  async getInfo(conn: DeviceConnection): Promise<DeviceInfo> {
    const session = await this.login(conn);
    const info = await this.apiRequest(conn.ip, conn.port, '/system_information.fcgi', {}, session);
    await this.apiRequest(conn.ip, conn.port, '/logout.fcgi', {}, session).catch(() => {});
    return {
      manufacturer: 'controlid',
      model: info?.model ?? 'Unknown',
      serialNumber: info?.serial ?? '',
      macAddress: info?.mac ?? null,
      firmwareVersion: info?.firmware ?? 'Unknown',
      hostname: info?.hostname ?? null,
      httpsEnabled: true,
      dhcpEnabled: !!info?.dhcp,
    };
  }

  async reboot(conn: DeviceConnection): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.apiRequest(conn.ip, conn.port, '/reboot.fcgi', {}, session);
      return true;
    } catch { return false; }
  }

  async openDoor(conn: DeviceConnection, doorId = 1): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.apiRequest(conn.ip, conn.port, '/execute_actions.fcgi', {
        actions: [{ action: 'door', parameters: `door=${doorId}` }],
      }, session);
      await this.apiRequest(conn.ip, conn.port, '/logout.fcgi', {}, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  async getConfig(conn: DeviceConnection): Promise<Record<string, unknown>> {
    const session = await this.login(conn);
    const config = await this.apiRequest(conn.ip, conn.port, '/get_configuration.fcgi', {}, session);
    await this.apiRequest(conn.ip, conn.port, '/logout.fcgi', {}, session).catch(() => {});
    return config ?? {};
  }

  async setConfig(conn: DeviceConnection, config: Record<string, unknown>): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.apiRequest(conn.ip, conn.port, '/set_configuration.fcgi', config, session);
      await this.apiRequest(conn.ip, conn.port, '/logout.fcgi', {}, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  async changePassword(conn: DeviceConnection, newUsername: string, newPassword: string): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.apiRequest(conn.ip, conn.port, '/set_configuration.fcgi', {
        admin: { login: newUsername, password: newPassword },
      }, session);
      await this.apiRequest(conn.ip, conn.port, '/logout.fcgi', {}, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async login(conn: DeviceConnection): Promise<string> {
    const res = await this.apiRequest(conn.ip, conn.port, '/login.fcgi', {
      login: conn.username, password: conn.password,
    });
    if (!res?.session) throw new Error(`Authentication failed for ${conn.ip}:${conn.port}`);
    return res.session;
  }

  private async apiRequest(ip: string, port: number, endpoint: string, body: any, session?: string): Promise<any> {
    return this.httpRequest('https', ip, port, endpoint, JSON.stringify(body), 10000, session);
  }

  /**
   * Low-level HTTP request using Node.js http/https modules.
   * This avoids issues with fetch() and self-signed certificates.
   */
  private httpRequest(
    protocol: string, ip: string, port: number, path: string,
    body: string, timeoutMs: number, session?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip,
        port,
        path,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(session ? { Cookie: `session=${session}` } : {}),
        },
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };

      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }
}
