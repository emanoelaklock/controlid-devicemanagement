/** Type-safe wrapper around the preload API */
declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => (() => void) | undefined;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export const ipc = {
  // Devices
  listDevices: () => window.api.invoke('devices:list'),
  getDevice: (id: string) => window.api.invoke('devices:get', id),
  createDevice: (data: any) => window.api.invoke('devices:create', data),
  updateDevice: (id: string, data: any) => window.api.invoke('devices:update', { id, data }),
  deleteDevice: (id: string) => window.api.invoke('devices:delete', id),
  testConnection: (id: string) => window.api.invoke('devices:test-connection', id),
  rebootDevice: (id: string) => window.api.invoke('devices:reboot', id),
  openDoor: (deviceId: string, doorId?: number) => window.api.invoke('devices:open-door', { deviceId, doorId }),

  // Batch
  batchReboot: (ids: string[]) => window.api.invoke('batch:reboot', ids),
  batchTestConnection: (ids: string[]) => window.api.invoke('batch:test-connection', ids),

  // Discovery
  startScan: (request: any) => window.api.invoke('discovery:scan', request),
  cancelScan: (jobId: string) => window.api.invoke('discovery:cancel', jobId),

  // Credentials
  listCredentials: () => window.api.invoke('credentials:list'),
  createCredential: (data: any) => window.api.invoke('credentials:create', data),
  updateCredential: (id: string, data: any) => window.api.invoke('credentials:update', { id, data }),
  deleteCredential: (id: string) => window.api.invoke('credentials:delete', id),

  // Jobs
  listJobs: () => window.api.invoke('jobs:list'),
  getJob: (id: string) => window.api.invoke('jobs:get', id),
  cancelJob: (id: string) => window.api.invoke('jobs:cancel', id),

  // Audit
  listAuditLogs: (opts?: any) => window.api.invoke('audit:list', opts || {}),

  // Groups
  listGroups: () => window.api.invoke('groups:list'),
  createGroup: (data: any) => window.api.invoke('groups:create', data),
  deleteGroup: (id: string) => window.api.invoke('groups:delete', id),

  // Dashboard
  getStats: () => window.api.invoke('dashboard:stats'),

  // Config
  backupConfig: (deviceId: string) => window.api.invoke('config:backup', deviceId),
  listBackups: (deviceId: string) => window.api.invoke('config:backups', deviceId),
  restoreConfig: (deviceId: string, backupId: string) => window.api.invoke('config:restore', { deviceId, backupId }),

  // Events
  on: window?.api?.on?.bind(window.api) ?? (() => undefined),
  removeAllListeners: window?.api?.removeAllListeners?.bind(window.api) ?? (() => {}),
};
