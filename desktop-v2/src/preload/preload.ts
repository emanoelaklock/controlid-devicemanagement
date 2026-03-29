import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - exposes a secure API to the renderer process.
 * Uses contextBridge to prevent direct access to Node.js APIs.
 */
contextBridge.exposeInMainWorld('api', {
  // ─── Invoke (request-response) ──────────────────────────────────
  invoke: (channel: string, ...args: any[]) => {
    const allowedChannels = [
      'devices:list', 'devices:get', 'devices:create', 'devices:update', 'devices:delete',
      'devices:test-connection', 'devices:reboot', 'devices:open-door', 'devices:set-network',
      'batch:reboot', 'batch:test-connection', 'batch:backup',
      'discovery:scan', 'discovery:cancel',
      'credentials:list', 'credentials:create', 'credentials:update', 'credentials:delete', 'credentials:set-default',
      'people:list', 'people:get', 'people:create', 'people:update', 'people:delete',
      'people:assign-devices', 'people:unassign-device', 'people:sync-to-device', 'people:batch-sync',
      'jobs:list', 'jobs:get', 'jobs:cancel',
      'audit:list',
      'groups:list', 'groups:create', 'groups:delete',
      'history:device', 'history:all-recent',
      'dashboard:stats',
      'config:backup', 'config:backups', 'config:restore',
      'templates:list', 'templates:create-from-device', 'templates:create', 'templates:delete', 'templates:get', 'templates:apply',
      'firmware:summary', 'firmware:check-all',
      'shell:open-url', 'dialog:prompt', 'dialog:confirm',
      'export:devices-csv', 'export:audit-csv',
    ];
    if (!allowedChannels.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  // ─── Listen (main → renderer events) ───────────────────────────
  on: (channel: string, callback: (...args: any[]) => void) => {
    const allowedEvents = [
      'discovery:progress', 'discovery:device-found', 'discovery:complete',
      'job:progress', 'job:complete',
      'heartbeat:update',
    ];
    if (!allowedEvents.includes(channel)) return;
    const sub = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
