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
  locateDevice: (id: string) => window.api.invoke('devices:locate', id),
  rebootDevice: (id: string) => window.api.invoke('devices:reboot', id),
  openDoor: (deviceId: string, doorId?: number) => window.api.invoke('devices:open-door', { deviceId, doorId }),
  setTime: (id: string) => window.api.invoke('devices:set-time', id),
  factoryReset: (id: string, keepNetwork: boolean) => window.api.invoke('devices:factory-reset', { id, keepNetwork }),
  setNetwork: (id: string, network: any) => window.api.invoke('devices:set-network', { id, network }),

  // Batch
  batchReboot: (ids: string[]) => window.api.invoke('batch:reboot', ids),
  batchTestConnection: (ids: string[]) => window.api.invoke('batch:test-connection', ids),
  batchBackup: (ids: string[]) => window.api.invoke('batch:backup', ids),

  // Discovery
  startScan: (request: any) => window.api.invoke('discovery:scan', request),
  cancelScan: (jobId: string) => window.api.invoke('discovery:cancel', jobId),

  // Credentials
  listCredentials: () => window.api.invoke('credentials:list'),
  createCredential: (data: any) => window.api.invoke('credentials:create', data),
  updateCredential: (id: string, data: any) => window.api.invoke('credentials:update', { id, data }),
  deleteCredential: (id: string) => window.api.invoke('credentials:delete', id),

  // People
  listPeople: (opts?: any) => window.api.invoke('people:list', opts || {}),
  getPerson: (id: string) => window.api.invoke('people:get', id),
  createPerson: (data: any) => window.api.invoke('people:create', data),
  updatePerson: (id: string, data: any) => window.api.invoke('people:update', { id, data }),
  deletePerson: (id: string) => window.api.invoke('people:delete', id),
  assignDevices: (personId: string, deviceIds: string[]) => window.api.invoke('people:assign-devices', { personId, deviceIds }),
  unassignDevice: (personId: string, deviceId: string) => window.api.invoke('people:unassign-device', { personId, deviceId }),
  syncPersonToDevice: (personId: string, deviceId: string) => window.api.invoke('people:sync-to-device', { personId, deviceId }),
  batchSyncPeople: (personIds: string[], deviceIds: string[]) => window.api.invoke('people:batch-sync', { personIds, deviceIds }),

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

  // Connection History
  deviceHistory: (deviceId: string, days?: number) => window.api.invoke('history:device', { deviceId, days }),
  recentHistory: (limit?: number) => window.api.invoke('history:all-recent', { limit }),

  // Dashboard
  getStats: () => window.api.invoke('dashboard:stats'),

  // Config
  backupConfig: (deviceId: string) => window.api.invoke('config:backup', deviceId),
  listBackups: (deviceId: string) => window.api.invoke('config:backups', deviceId),
  restoreConfig: (deviceId: string, backupId: string) => window.api.invoke('config:restore', { deviceId, backupId }),

  // Templates
  listTemplates: () => window.api.invoke('templates:list'),
  createTemplateFromDevice: (deviceId: string, templateName: string) => window.api.invoke('templates:create-from-device', { deviceId, templateName }),
  createTemplate: (data: any) => window.api.invoke('templates:create', data),
  getTemplate: (id: string) => window.api.invoke('templates:get', id),
  deleteTemplate: (id: string) => window.api.invoke('templates:delete', id),
  applyTemplate: (templateId: string, deviceIds: string[]) => window.api.invoke('templates:apply', { templateId, deviceIds }),

  // Firmware
  firmwareSummary: () => window.api.invoke('firmware:summary'),
  firmwareCheckAll: (deviceIds: string[]) => window.api.invoke('firmware:check-all', deviceIds),

  // Export
  exportDevicesCsv: () => window.api.invoke('export:devices-csv'),
  exportAuditCsv: () => window.api.invoke('export:audit-csv'),

  // Dialogs (prompt/confirm don't work in Electron with contextIsolation)
  prompt: (title: string, message: string, defaultValue?: string): Promise<string | null> =>
    window.api.invoke('dialog:prompt', { title, message, defaultValue }),
  confirm: (message: string): Promise<boolean> =>
    window.api.invoke('dialog:confirm', message),

  // Events - must be lazy to ensure window.api is available
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (window?.api?.on) return window.api.on(channel, callback);
    return undefined;
  },
  removeAllListeners: (channel: string) => {
    if (window?.api?.removeAllListeners) window.api.removeAllListeners(channel);
  },
};
