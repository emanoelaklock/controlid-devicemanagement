import { DeviceAdapter, DeviceConnection, DeviceInfo, DiscoveredDevice } from '../types';

/**
 * Control iD device adapter.
 * Implements the DeviceAdapter interface for Control iD access control devices.
 * API reference: Control iD RESTful API (login.fcgi, load_objects.fcgi, etc.)
 */
export class ControlIdAdapter implements DeviceAdapter {
  readonly manufacturer = 'controlid';

  async probe(ip: string, port: number, timeoutMs: number): Promise<DiscoveredDevice | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();

      const res = await fetch(`https://${ip}:${port}/system_information.fcgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timer);
      if (!res) return null;

      const elapsed = Date.now() - start;
      const data = await res.json().catch(() => null) as Record<string, any> | null;

      if (!data) return null;

      return {
        ipAddress: ip,
        port,
        macAddress: data.mac ?? null,
        hostname: data.hostname ?? null,
        manufacturer: 'controlid',
        model: data.model ?? data.product ?? null,
        serialNumber: data.serial ?? null,
        firmwareVersion: data.firmware ?? data.version ?? null,
        httpsEnabled: port === 443,
        responseTimeMs: elapsed,
        alreadyManaged: false,
        existingDeviceId: null,
      };
    } catch {
      return null;
    }
  }

  async authenticate(ip: string, port: number, username: string, password: string): Promise<DeviceInfo | null> {
    try {
      const loginRes = await this.request(ip, port, '/login.fcgi', { login: username, password });
      if (!loginRes?.session) return null;

      const info = await this.request(ip, port, '/system_information.fcgi', {}, loginRes.session);
      await this.request(ip, port, '/logout.fcgi', {}, loginRes.session);

      return {
        manufacturer: 'controlid',
        model: info?.model ?? info?.product ?? 'Unknown',
        serialNumber: info?.serial ?? '',
        macAddress: info?.mac ?? null,
        firmwareVersion: info?.firmware ?? info?.version ?? 'Unknown',
        hostname: info?.hostname ?? null,
        httpsEnabled: port === 443,
        dhcpEnabled: !!info?.dhcp,
      };
    } catch {
      return null;
    }
  }

  async getInfo(conn: DeviceConnection): Promise<DeviceInfo> {
    const session = await this.login(conn);
    const info = await this.request(conn.ip, conn.port, '/system_information.fcgi', {}, session);
    await this.request(conn.ip, conn.port, '/logout.fcgi', {}, session);

    return {
      manufacturer: 'controlid',
      model: info?.model ?? 'Unknown',
      serialNumber: info?.serial ?? '',
      macAddress: info?.mac ?? null,
      firmwareVersion: info?.firmware ?? 'Unknown',
      hostname: info?.hostname ?? null,
      httpsEnabled: conn.port === 443,
      dhcpEnabled: !!info?.dhcp,
    };
  }

  async reboot(conn: DeviceConnection): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.request(conn.ip, conn.port, '/reboot.fcgi', {}, session);
      return true;
    } catch { return false; }
  }

  async openDoor(conn: DeviceConnection, doorId = 1): Promise<boolean> {
    try {
      const session = await this.login(conn);
      const result = await this.request(conn.ip, conn.port, '/execute_actions.fcgi', {
        actions: [{ action: 'door', parameters: `door=${doorId}` }],
      }, session);
      await this.request(conn.ip, conn.port, '/logout.fcgi', {}, session);
      return !!result;
    } catch { return false; }
  }

  async getConfig(conn: DeviceConnection): Promise<Record<string, unknown>> {
    const session = await this.login(conn);
    const config = await this.request(conn.ip, conn.port, '/get_configuration.fcgi', {}, session);
    await this.request(conn.ip, conn.port, '/logout.fcgi', {}, session);
    return config ?? {};
  }

  async setConfig(conn: DeviceConnection, config: Record<string, unknown>): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.request(conn.ip, conn.port, '/set_configuration.fcgi', config, session);
      await this.request(conn.ip, conn.port, '/logout.fcgi', {}, session);
      return true;
    } catch { return false; }
  }

  async changePassword(conn: DeviceConnection, newUsername: string, newPassword: string): Promise<boolean> {
    try {
      const session = await this.login(conn);
      await this.request(conn.ip, conn.port, '/set_configuration.fcgi', {
        admin: { login: newUsername, password: newPassword },
      }, session);
      await this.request(conn.ip, conn.port, '/logout.fcgi', {}, session);
      return true;
    } catch { return false; }
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async login(conn: DeviceConnection): Promise<string> {
    const res = await this.request(conn.ip, conn.port, '/login.fcgi', {
      login: conn.username, password: conn.password,
    });
    if (!res?.session) throw new Error(`Authentication failed for ${conn.ip}`);
    return res.session;
  }

  private async request(ip: string, port: number, endpoint: string, body: any, session?: string): Promise<any> {
    const res = await fetch(`https://${ip}:${port}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Cookie: `session=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => null);
  }
}
