// ═══════════════════════════════════════════════════════════════════
// Core domain types for the Device Manager
// ═══════════════════════════════════════════════════════════════════

export interface Device {
  id: string;
  name: string;
  manufacturer: string;       // 'controlid' | 'hikvision' | 'intelbras' etc
  model: string;
  serialNumber: string;
  macAddress: string | null;
  ipAddress: string;
  port: number;
  hostname: string | null;
  firmwareVersion: string | null;
  status: DeviceStatus;
  lastSeen: string | null;
  lastHeartbeat: string | null;
  credentialId: string | null; // FK to credentials
  groupId: string | null;
  tags: string | null;         // JSON array of tags
  notes: string | null;
  httpsEnabled: number;
  dhcpEnabled: number;
  createdAt: string;
  updatedAt: string;
}

export type DeviceStatus = 'online' | 'offline' | 'error' | 'syncing' | 'unknown' | 'unreachable';

export interface Credential {
  id: string;
  name: string;              // e.g. "Default Admin", "Site A Credentials"
  username: string;
  password: string;          // encrypted
  isDefault: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceGroup {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  title: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;           // 0-100
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdBy: string | null;
}

export type JobType =
  | 'discovery'
  | 'firmware_upgrade'
  | 'config_backup'
  | 'config_restore'
  | 'batch_reboot'
  | 'batch_credential'
  | 'batch_config'
  | 'sync_people'
  | 'health_check';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobItem {
  id: string;
  jobId: string;
  deviceId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  category: string;           // 'device' | 'credential' | 'firmware' | 'config' | 'system'
  deviceId: string | null;
  deviceName: string | null;
  details: string | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  createdAt: string;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  manufacturer: string;
  model: string | null;       // null = applies to all models from manufacturer
  config: string;             // JSON blob
  createdAt: string;
  updatedAt: string;
}

export interface ConfigBackup {
  id: string;
  deviceId: string;
  deviceName: string;
  config: string;             // JSON blob
  version: number;
  createdAt: string;
}

// ─── Discovery types ─────────────────────────────────────────────

export interface DiscoveryRequest {
  ranges: string[];            // e.g. ['192.168.1.1-192.168.1.254', '10.0.0.*']
  ports: number[];             // e.g. [80, 443]
  timeout: number;             // ms per host
  concurrency: number;         // max parallel scans
  credentialIds?: string[];    // credentials to try
}

export interface DiscoveredDevice {
  ipAddress: string;
  port: number;
  macAddress: string | null;
  hostname: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  httpsEnabled: boolean;
  responseTimeMs: number;
  alreadyManaged: boolean;     // already in our DB
  existingDeviceId: string | null;
}

// ─── Adapter interface ───────────────────────────────────────────

export interface DeviceAdapter {
  readonly manufacturer: string;

  /** Try to identify if a device at this address is from this manufacturer */
  probe(ip: string, port: number, timeoutMs: number): Promise<DiscoveredDevice | null>;

  /** Authenticate and return device info */
  authenticate(ip: string, port: number, username: string, password: string): Promise<DeviceInfo | null>;

  /** Get full device information */
  getInfo(connection: DeviceConnection): Promise<DeviceInfo>;

  /** Reboot device */
  reboot(connection: DeviceConnection): Promise<boolean>;

  /** Open door / trigger relay */
  openDoor(connection: DeviceConnection, doorId?: number): Promise<boolean>;

  /** Get device configuration as JSON */
  getConfig(connection: DeviceConnection): Promise<Record<string, unknown>>;

  /** Apply configuration */
  setConfig(connection: DeviceConnection, config: Record<string, unknown>): Promise<boolean>;

  /** Change device credentials */
  changePassword(connection: DeviceConnection, newUsername: string, newPassword: string): Promise<boolean>;
}

export interface DeviceConnection {
  ip: string;
  port: number;
  username: string;
  password: string;
  session?: string;
}

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  serialNumber: string;
  macAddress: string | null;
  firmwareVersion: string;
  hostname: string | null;
  httpsEnabled: boolean;
  dhcpEnabled: boolean;
  uptime?: number;
}

// ─── IPC Channel definitions ─────────────────────────────────────

export type IpcChannels = {
  // Devices
  'devices:list': { args: void; result: Device[] };
  'devices:get': { args: string; result: Device | null };
  'devices:create': { args: Partial<Device>; result: Device };
  'devices:update': { args: { id: string; data: Partial<Device> }; result: Device };
  'devices:delete': { args: string; result: void };
  'devices:test-connection': { args: string; result: { connected: boolean; info?: DeviceInfo } };
  'devices:reboot': { args: string; result: boolean };
  'devices:open-door': { args: { deviceId: string; doorId?: number }; result: boolean };

  // Discovery
  'discovery:scan': { args: DiscoveryRequest; result: string }; // returns jobId
  'discovery:cancel': { args: string; result: void };

  // Credentials
  'credentials:list': { args: void; result: Credential[] };
  'credentials:create': { args: { name: string; username: string; password: string }; result: Credential };
  'credentials:update': { args: { id: string; data: Partial<Credential> }; result: Credential };
  'credentials:delete': { args: string; result: void };

  // Jobs
  'jobs:list': { args: void; result: Job[] };
  'jobs:get': { args: string; result: { job: Job; items: JobItem[] } | null };
  'jobs:cancel': { args: string; result: void };

  // Audit
  'audit:list': { args: { limit?: number; offset?: number; category?: string }; result: AuditLog[] };

  // Groups
  'groups:list': { args: void; result: DeviceGroup[] };
  'groups:create': { args: { name: string; color?: string }; result: DeviceGroup };
  'groups:delete': { args: string; result: void };

  // Dashboard
  'dashboard:stats': { args: void; result: DashboardStats };

  // Config
  'config:backup': { args: string; result: ConfigBackup };
  'config:restore': { args: { deviceId: string; backupId: string }; result: boolean };
  'config:backups': { args: string; result: ConfigBackup[] };
};

export interface DashboardStats {
  devices: { total: number; online: number; offline: number; error: number; unknown: number };
  recentAlerts: AuditLog[];
  jobsRunning: number;
  lastScanAt: string | null;
}
