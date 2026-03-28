import { logger } from '../config/logger';

interface ControlIdResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export class ControlIdService {
  private baseUrl: string;
  private session: string | null = null;

  constructor(
    private ip: string,
    private port: number,
    private login: string,
    private password: string
  ) {
    this.baseUrl = `https://${ip}:${port}`;
  }

  private async request(endpoint: string, body: Record<string, unknown>): Promise<ControlIdResponse> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.session ? { Cookie: `session=${this.session}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as Record<string, unknown>;
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Control iD API error [${this.ip}]: ${message}`);
      return { success: false, error: message };
    }
  }

  async login_(): Promise<boolean> {
    const result = await this.request('/login.fcgi', {
      login: this.login,
      password: this.password,
    });

    if (result.success && result.data?.session) {
      this.session = result.data.session as string;
      return true;
    }
    return false;
  }

  async logout(): Promise<void> {
    if (this.session) {
      await this.request('/logout.fcgi', {});
      this.session = null;
    }
  }

  async getDeviceInfo(): Promise<ControlIdResponse> {
    return this.request('/system_information.fcgi', {});
  }

  async getUsers(offset = 0, limit = 100): Promise<ControlIdResponse> {
    return this.request('/load_objects.fcgi', {
      object: 'users',
      offset,
      limit,
    });
  }

  async addUser(user: {
    id: number;
    name: string;
    registration: string;
    password?: string;
  }): Promise<ControlIdResponse> {
    return this.request('/create_objects.fcgi', {
      object: 'users',
      values: [user],
    });
  }

  async removeUser(userId: number): Promise<ControlIdResponse> {
    return this.request('/destroy_objects.fcgi', {
      object: 'users',
      where: { users: { id: userId } },
    });
  }

  async addCard(userId: number, cardNumber: number): Promise<ControlIdResponse> {
    return this.request('/create_objects.fcgi', {
      object: 'cards',
      values: [{ user_id: userId, value: cardNumber }],
    });
  }

  async getAccessLogs(offset = 0, limit = 100): Promise<ControlIdResponse> {
    return this.request('/load_objects.fcgi', {
      object: 'access_logs',
      offset,
      limit,
      order: 'desc',
    });
  }

  async openDoor(doorId = 1): Promise<ControlIdResponse> {
    return this.request('/execute_actions.fcgi', {
      actions: [{ action: 'door', parameters: `door=${doorId}` }],
    });
  }

  async setConfiguration(key: string, value: string | number): Promise<ControlIdResponse> {
    return this.request('/set_configuration.fcgi', {
      [key]: value,
    });
  }

  async getConfiguration(): Promise<ControlIdResponse> {
    return this.request('/get_configuration.fcgi', {});
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.getDeviceInfo();
      return result.success;
    } catch {
      return false;
    }
  }
}
