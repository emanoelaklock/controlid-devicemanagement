import https from 'https';
import http from 'http';
import { DeviceAdapter, DeviceConnection, DeviceInfo, DiscoveredDevice } from '../types';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Control iD device adapter.
 * Supports both legacy .fcgi API and newer REST API used by iDFace MAX and newer models.
 *
 * API variants:
 * - Legacy: POST /login.fcgi, /system_information.fcgi, /execute_actions.fcgi
 * - New:    POST /api/login, GET /api/system/information, etc.
 *
 * Detection: probe tries multiple endpoints to identify the device.
 */
export class ControlIdAdapter implements DeviceAdapter {
  readonly manufacturer = 'controlid';

  async probe(ip: string, port: number, timeoutMs: number): Promise<DiscoveredDevice | null> {
    const start = Date.now();
    const proto = port === 443 ? 'https' : 'http';

    // Strategy 1: Try legacy .fcgi API (older firmware)
    try {
      const data = await this.httpRequest(proto, ip, port, '/system_information.fcgi', '{}', timeoutMs);
      if (data && (data.serial || data.model || data.mac || data.firmware)) {
        return this.buildDiscovered(ip, port, proto, data, Date.now() - start);
      }
    } catch { /* try next */ }

    // Strategy 2: Try newer API endpoints
    try {
      const data = await this.httpGet(proto, ip, port, '/api/system/information', timeoutMs);
      if (data && (data.serial || data.model || data.mac)) {
        return this.buildDiscovered(ip, port, proto, data, Date.now() - start);
      }
    } catch { /* try next */ }

    // Strategy 3: Try to detect by checking if login page exists (HTTP response)
    try {
      const html = await this.httpGetRaw(proto, ip, port, '/', timeoutMs);
      if (html && (html.includes('controlid') || html.includes('Control iD') || html.includes('iDFace') || html.includes('iDAcesso') || html.includes('idaccess'))) {
        return {
          ipAddress: ip, port,
          macAddress: null, hostname: null,
          manufacturer: 'controlid',
          model: this.extractFromHtml(html, 'iDFace|iDAcesso|iDAccess|iDBox|iDBlock|iDFlex') ?? 'Control iD Device',
          serialNumber: null, firmwareVersion: null,
          httpsEnabled: proto === 'https',
          responseTimeMs: Date.now() - start,
          alreadyManaged: false, existingDeviceId: null,
        };
      }
    } catch { /* not a Control iD device */ }

    return null;
  }

  async authenticate(ip: string, port: number, username: string, password: string): Promise<DeviceInfo | null> {
    const proto = port === 443 ? 'https' : 'http';

    // Try legacy .fcgi login
    try {
      const loginRes = await this.httpRequest(proto, ip, port, '/login.fcgi', JSON.stringify({ login: username, password }), 10000);
      if (loginRes?.session) {
        const info = await this.httpRequest(proto, ip, port, '/system_information.fcgi', '{}', 10000, loginRes.session);
        console.log('[ControlID] system_information response:', JSON.stringify(info, null, 2));

        // Also try to get network config for MAC and DHCP
        const netConfig = await this.httpRequest(proto, ip, port, '/get_configuration.fcgi', '{}', 10000, loginRes.session).catch(() => null);
        if (netConfig) {
          console.log('[ControlID] get_configuration response:', JSON.stringify(netConfig, null, 2));
        }

        await this.httpRequest(proto, ip, port, '/logout.fcgi', '{}', 5000, loginRes.session).catch(() => {});
        return this.buildDeviceInfo(info, proto, netConfig);
      }
    } catch { /* try next */ }

    // Try new API login
    try {
      const loginRes = await this.httpRequest(proto, ip, port, '/api/login', JSON.stringify({ login: username, password }), 10000);
      if (loginRes?.session || loginRes?.token || loginRes?.access_token) {
        const session = loginRes.session || loginRes.token || loginRes.access_token;
        const info = await this.httpGet(proto, ip, port, '/api/system/information', 10000, session);
        return this.buildDeviceInfo(info, proto);
      }
    } catch { /* try next */ }

    // Try Basic Auth
    try {
      const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      const info = await this.httpGet(proto, ip, port, '/api/system/information', 10000, undefined, authHeader);
      if (info && (info.model || info.serial)) {
        return this.buildDeviceInfo(info, proto);
      }
    } catch { /* all methods failed */ }

    return null;
  }

  async getInfo(conn: DeviceConnection): Promise<DeviceInfo> {
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    const info = await this.httpRequest(proto, conn.ip, conn.port, '/system_information.fcgi', '{}', 10000, session);
    const netConfig = await this.httpRequest(proto, conn.ip, conn.port, '/get_configuration.fcgi', '{}', 10000, session).catch(() => null);
    await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    return this.buildDeviceInfo(info, proto, netConfig);
  }

  async reboot(conn: DeviceConnection): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/reboot.fcgi', '{}', 10000, session);
      return true;
    } catch { return false; }
  }

  async openDoor(conn: DeviceConnection, doorId = 1): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/execute_actions.fcgi',
        JSON.stringify({ actions: [{ action: 'door', parameters: `door=${doorId}` }] }), 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  async getConfig(conn: DeviceConnection): Promise<Record<string, unknown>> {
    const session = await this.login(conn);
    const proto = conn.port === 443 ? 'https' : 'http';
    const config = await this.httpRequest(proto, conn.ip, conn.port, '/get_configuration.fcgi', '{}', 10000, session);
    await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
    return config ?? {};
  }

  async setConfig(conn: DeviceConnection, config: Record<string, unknown>): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/set_configuration.fcgi', JSON.stringify(config), 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  async changePassword(conn: DeviceConnection, newUsername: string, newPassword: string): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const proto = conn.port === 443 ? 'https' : 'http';
      await this.httpRequest(proto, conn.ip, conn.port, '/set_configuration.fcgi',
        JSON.stringify({ admin: { login: newUsername, password: newPassword } }), 10000, session);
      await this.httpRequest(proto, conn.ip, conn.port, '/logout.fcgi', '{}', 5000, session).catch(() => {});
      return true;
    } catch { return false; }
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async login(conn: DeviceConnection): Promise<string> {
    const proto = conn.port === 443 ? 'https' : 'http';

    // Try .fcgi login first
    try {
      const res = await this.httpRequest(proto, conn.ip, conn.port, '/login.fcgi',
        JSON.stringify({ login: conn.username, password: conn.password }), 10000);
      if (res?.session) return res.session;
    } catch { /* try next */ }

    // Try new API login
    try {
      const res = await this.httpRequest(proto, conn.ip, conn.port, '/api/login',
        JSON.stringify({ login: conn.username, password: conn.password }), 10000);
      if (res?.session || res?.token || res?.access_token) {
        return res.session || res.token || res.access_token;
      }
    } catch { /* fallthrough */ }

    throw new Error(`Authentication failed for ${conn.ip}:${conn.port}`);
  }

  private buildDiscovered(ip: string, port: number, proto: string, data: any, elapsed: number): DiscoveredDevice {
    return {
      ipAddress: ip, port,
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
  }

  private buildDeviceInfo(info: any, proto: string, netConfig?: any): DeviceInfo {
    if (!info) info = {};
    const net = netConfig?.network ?? netConfig?.general?.network ?? netConfig ?? {};

    return {
      manufacturer: 'controlid',
      model: info.model ?? info.product ?? info.device_name ?? info.name ?? 'Unknown',
      serialNumber: info.serial ?? info.serial_number ?? info.serialNumber ?? '',
      macAddress: info.mac ?? info.mac_address ?? info.macAddress ?? info.MAC
        ?? net.mac ?? net.mac_address ?? net.MAC ?? null,
      firmwareVersion: info.firmware ?? info.version ?? info.firmware_version ?? info.sw_version ?? 'Unknown',
      hostname: info.hostname ?? info.host_name ?? info.device_id ?? net.hostname ?? null,
      httpsEnabled: proto === 'https',
      dhcpEnabled: !!(info.dhcp ?? info.dhcp_enabled ?? net.dhcp ?? net.DHCP ?? false),
    };
  }

  private extractFromHtml(html: string, pattern: string): string | null {
    const regex = new RegExp(`(${pattern})\\S*`, 'i');
    const match = html.match(regex);
    return match ? match[0] : null;
  }

  /** POST request returning parsed JSON */
  private httpRequest(
    protocol: string, ip: string, port: number, path: string,
    body: string, timeoutMs: number, session?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path, method: 'POST', timeout: timeoutMs,
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
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  /** GET request returning parsed JSON */
  private httpGet(
    protocol: string, ip: string, port: number, path: string,
    timeoutMs: number, session?: string, authHeader?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (session) headers['Cookie'] = `session=${session}`;
      if (authHeader) headers['Authorization'] = authHeader;
      const options: https.RequestOptions = {
        hostname: ip, port, path, method: 'GET', timeout: timeoutMs,
        headers,
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  /** GET request returning raw HTML string */
  private httpGetRaw(
    protocol: string, ip: string, port: number, path: string, timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = protocol === 'https' ? https : http;
      const options: https.RequestOptions = {
        hostname: ip, port, path, method: 'GET', timeout: timeoutMs,
        ...(protocol === 'https' ? { agent: httpsAgent } : {}),
      };
      const req = mod.request(options, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          if (loc.startsWith('/')) {
            return this.httpGetRaw(protocol, ip, port, loc, timeoutMs).then(resolve).catch(reject);
          }
        }
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }
}
