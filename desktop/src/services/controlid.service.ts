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
    private loginUser: string,
    private password: string
  ) {
    this.baseUrl = `https://${ip}:${port}`;
  }

  private async request(endpoint: string, body: Record<string, unknown>): Promise<ControlIdResponse> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async login(): Promise<boolean> {
    const result = await this.request('/login.fcgi', { login: this.loginUser, password: this.password });
    if (result.success && result.data?.session) {
      this.session = result.data.session as string;
      return true;
    }
    return false;
  }

  async logout(): Promise<void> {
    if (this.session) { await this.request('/logout.fcgi', {}); this.session = null; }
  }

  async getDeviceInfo(): Promise<ControlIdResponse> { return this.request('/system_information.fcgi', {}); }

  async addUser(user: { id: number; name: string; registration: string }): Promise<ControlIdResponse> {
    return this.request('/create_objects.fcgi', { object: 'users', values: [user] });
  }

  async removeUser(userId: number): Promise<ControlIdResponse> {
    return this.request('/destroy_objects.fcgi', { object: 'users', where: { users: { id: userId } } });
  }

  async addCard(userId: number, cardNumber: number): Promise<ControlIdResponse> {
    return this.request('/create_objects.fcgi', { object: 'cards', values: [{ user_id: userId, value: cardNumber }] });
  }

  async openDoor(doorId = 1): Promise<ControlIdResponse> {
    return this.request('/execute_actions.fcgi', { actions: [{ action: 'door', parameters: `door=${doorId}` }] });
  }

  async ping(): Promise<boolean> {
    try { const r = await this.getDeviceInfo(); return r.success; } catch { return false; }
  }
}
