import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import { query, queryOne, run, count, insertAndReturn } from '../db/queries';
import { discoveryService } from '../services/discovery.service';
import { jobService } from '../services/job.service';
import { adapterRegistry } from '../adapters/registry';
import { encrypt, decrypt } from '../utils/encryption';
import { DeviceConnection } from '../types';

/**
 * Register all IPC handlers.
 * Each handler follows the pattern: channel name → async handler.
 * The preload script exposes these as typed async functions to the renderer.
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {

  // ─── Devices ────────────────────────────────────────────────────

  ipcMain.handle('devices:list', () => {
    return query(`SELECT d.*, c.name as credential_name, g.name as group_name
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id
      LEFT JOIN device_groups g ON d.group_id = g.id ORDER BY d.name ASC`);
  });

  ipcMain.handle('devices:get', (_e, id: string) => {
    return queryOne(`SELECT d.*, c.name as credential_name, g.name as group_name
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id
      LEFT JOIN device_groups g ON d.group_id = g.id WHERE d.id = ?`, [id]);
  });

  ipcMain.handle('devices:create', (_e, data: any) => {
    const id = uuid();
    return insertAndReturn('devices', { id, ...data, status: 'unknown' });
  });

  ipcMain.handle('devices:update', (_e, { id, data }: { id: string; data: any }) => {
    const existing = queryOne('SELECT * FROM devices WHERE id = ?', [id]);
    if (!existing) throw new Error('Device not found');
    const fields = Object.entries(data).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) return existing;
    const setClause = fields.map(([k]) => `${k}=?`).join(',');
    run(`UPDATE devices SET ${setClause}, updated_at=datetime('now') WHERE id=?`,
      [...fields.map(([_, v]) => v), id]);
    return queryOne('SELECT * FROM devices WHERE id = ?', [id]);
  });

  ipcMain.handle('devices:delete', (_e, id: string) => {
    run('DELETE FROM devices WHERE id = ?', [id]);
    run(`INSERT INTO audit_logs (id, action, category, device_id, severity) VALUES (?,?,'device',?,'info')`,
      [uuid(), 'device_deleted', id]);
  });

  ipcMain.handle('devices:test-connection', async (_e, id: string) => {
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [id]);
    if (!device) throw new Error('Device not found');

    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) throw new Error(`No adapter for manufacturer: ${device.manufacturer}`);

    const info = await adapter.authenticate(
      device.ip_address, device.port,
      device.username || 'admin',
      device.cred_password ? decrypt(device.cred_password) : ''
    );

    if (info) {
      console.log('[TestConnection] DeviceInfo returned:', JSON.stringify(info));
      run(`UPDATE devices SET status='online', firmware_version=?, model=?, serial_number=?,
        mac_address=?, last_heartbeat=datetime('now'), https_enabled=?, dhcp_enabled=?,
        hostname=?, updated_at=datetime('now') WHERE id=?`,
        [info.firmwareVersion, info.model, info.serialNumber, info.macAddress,
         info.httpsEnabled ? 1 : 0, info.dhcpEnabled ? 1 : 0, info.hostname, id]);

      // Verify the update worked
      const updated = queryOne('SELECT model, mac_address, dhcp_enabled, firmware_version FROM devices WHERE id=?', [id]);
      console.log('[TestConnection] DB after update:', JSON.stringify(updated));

      return { connected: true, info };
    }

    run(`UPDATE devices SET status='unreachable', updated_at=datetime('now') WHERE id=?`, [id]);
    return { connected: false };
  });

  ipcMain.handle('devices:reboot', async (_e, id: string) => {
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [id]);
    if (!device) throw new Error('Device not found');
    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) return false;
    const conn: DeviceConnection = { ip: device.ip_address, port: device.port,
      username: device.username || 'admin', password: device.cred_password ? decrypt(device.cred_password) : '' };
    return adapter.reboot(conn);
  });

  ipcMain.handle('devices:open-door', async (_e, { deviceId, doorId }: { deviceId: string; doorId?: number }) => {
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [deviceId]);
    if (!device) throw new Error('Device not found');
    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) return false;
    const conn: DeviceConnection = { ip: device.ip_address, port: device.port,
      username: device.username || 'admin', password: device.cred_password ? decrypt(device.cred_password) : '' };
    return adapter.openDoor(conn, doorId);
  });

  // ─── Batch operations ──────────────────────────────────────────

  ipcMain.handle('batch:reboot', async (_e, deviceIds: string[]) => {
    return jobService.createJob('batch_reboot', `Reboot ${deviceIds.length} devices`, deviceIds,
      async (conn, device) => {
        const adapter = adapterRegistry.get(device.manufacturer);
        if (!adapter) throw new Error('No adapter');
        const ok = await adapter.reboot(conn);
        if (!ok) throw new Error('Reboot failed');
        return 'Rebooted successfully';
      }, getWindow());
  });

  ipcMain.handle('batch:test-connection', async (_e, deviceIds: string[]) => {
    return jobService.createJob('health_check', `Test ${deviceIds.length} devices`, deviceIds,
      async (conn, device) => {
        const adapter = adapterRegistry.get(device.manufacturer);
        if (!adapter) throw new Error('No adapter');
        const info = await adapter.authenticate(conn.ip, conn.port, conn.username, conn.password);
        if (info) {
          run(`UPDATE devices SET status='online', firmware_version=?, model=?, serial_number=?,
            mac_address=?, last_heartbeat=datetime('now'), https_enabled=?, dhcp_enabled=?,
            hostname=?, updated_at=datetime('now') WHERE id=?`,
            [info.firmwareVersion, info.model, info.serialNumber, info.macAddress,
             info.httpsEnabled ? 1 : 0, info.dhcpEnabled ? 1 : 0, info.hostname, device.id]);
          return `Online - ${info.model} v${info.firmwareVersion} MAC:${info.macAddress || 'N/A'}`;
        }
        run(`UPDATE devices SET status='unreachable' WHERE id=?`, [device.id]);
        throw new Error('Could not connect');
      }, getWindow());
  });

  ipcMain.handle('batch:backup', async (_e, deviceIds: string[]) => {
    return jobService.createJob('config_backup', `Backup ${deviceIds.length} devices`, deviceIds,
      async (conn, device) => {
        const adapter = adapterRegistry.get(device.manufacturer);
        if (!adapter) throw new Error('No adapter');
        const config = await adapter.getConfig(conn);
        const version = count('SELECT COUNT(*) as c FROM config_backups WHERE device_id = ?', [device.id]) + 1;
        run(`INSERT INTO config_backups (id, device_id, device_name, config, version) VALUES (?,?,?,?,?)`,
          [uuid(), device.id, device.name, JSON.stringify(config), version]);
        return `Backup v${version} saved`;
      }, getWindow());
  });

  // ─── Discovery ──────────────────────────────────────────────────

  ipcMain.handle('discovery:scan', async (_e, request: any) => {
    return discoveryService.startScan(request, getWindow());
  });

  ipcMain.handle('discovery:cancel', (_e, jobId: string) => {
    discoveryService.cancelScan(jobId);
  });

  // ─── Credentials ────────────────────────────────────────────────

  ipcMain.handle('credentials:list', () => {
    return query('SELECT id, name, username, is_default, created_at, updated_at FROM credentials ORDER BY is_default DESC, name ASC');
  });

  ipcMain.handle('credentials:create', (_e, { name, username, password, isDefault }: any) => {
    const id = uuid();
    // If setting as default, clear other defaults first
    if (isDefault) {
      run('UPDATE credentials SET is_default = 0 WHERE is_default = 1');
    }
    run(`INSERT INTO credentials (id, name, username, password, is_default) VALUES (?,?,?,?,?)`,
      [id, name, username, encrypt(password), isDefault ? 1 : 0]);
    return queryOne('SELECT id, name, username, is_default, created_at FROM credentials WHERE id = ?', [id]);
  });

  ipcMain.handle('credentials:set-default', (_e, id: string) => {
    run('UPDATE credentials SET is_default = 0 WHERE is_default = 1');
    run('UPDATE credentials SET is_default = 1 WHERE id = ?', [id]);
  });

  ipcMain.handle('credentials:update', (_e, { id, data }: any) => {
    const existing = queryOne('SELECT * FROM credentials WHERE id = ?', [id]);
    if (!existing) throw new Error('Credential not found');
    run(`UPDATE credentials SET name=?, username=?, password=?, updated_at=datetime('now') WHERE id=?`,
      [data.name ?? existing.name, data.username ?? existing.username,
       data.password ? encrypt(data.password) : existing.password, id]);
    return queryOne('SELECT id, name, username, is_default FROM credentials WHERE id = ?', [id]);
  });

  ipcMain.handle('credentials:delete', (_e, id: string) => {
    run('DELETE FROM credentials WHERE id = ?', [id]);
  });

  // ─── People ─────────────────────────────────────────────────────

  ipcMain.handle('people:list', (_e, opts: any = {}) => {
    let sql = 'SELECT * FROM people WHERE 1=1';
    const params: any[] = [];
    if (opts.search) { sql += ' AND (name LIKE ? OR registration LIKE ? OR card_number LIKE ?)'; params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`); }
    if (opts.active !== undefined) { sql += ' AND active = ?'; params.push(opts.active ? 1 : 0); }
    sql += ' ORDER BY name ASC';
    const people = query(sql, params);
    // Attach device count
    return people.map((p: any) => {
      const deviceCount = count('SELECT COUNT(*) as c FROM person_devices WHERE person_id = ?', [p.id]);
      const syncedCount = count('SELECT COUNT(*) as c FROM person_devices WHERE person_id = ? AND synced = 1', [p.id]);
      return { ...p, active: !!p.active, deviceCount, syncedCount };
    });
  });

  ipcMain.handle('people:get', (_e, id: string) => {
    const person = queryOne('SELECT * FROM people WHERE id = ?', [id]);
    if (!person) return null;
    const devices = query(`SELECT pd.*, d.name as device_name, d.ip_address, d.status as device_status
      FROM person_devices pd JOIN devices d ON pd.device_id = d.id WHERE pd.person_id = ?`, [id]);
    return { ...person, active: !!person.active, devices };
  });

  ipcMain.handle('people:create', (_e, data: any) => {
    const id = uuid();
    run(`INSERT INTO people (id, name, registration, card_number, pin_code, active, group_name, notes) VALUES (?,?,?,?,?,?,?,?)`,
      [id, data.name, data.registration, data.card_number || null, data.pin_code || null, data.active !== false ? 1 : 0, data.group_name || null, data.notes || null]);
    return queryOne('SELECT * FROM people WHERE id = ?', [id]);
  });

  ipcMain.handle('people:update', (_e, { id, data }: any) => {
    const existing = queryOne('SELECT * FROM people WHERE id = ?', [id]);
    if (!existing) throw new Error('Person not found');
    run(`UPDATE people SET name=?, registration=?, card_number=?, pin_code=?, active=?, group_name=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [data.name ?? existing.name, data.registration ?? existing.registration, data.card_number ?? existing.card_number,
       data.pin_code ?? existing.pin_code, data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
       data.group_name ?? existing.group_name, data.notes ?? existing.notes, id]);
    return queryOne('SELECT * FROM people WHERE id = ?', [id]);
  });

  ipcMain.handle('people:delete', (_e, id: string) => {
    run('DELETE FROM people WHERE id = ?', [id]);
  });

  ipcMain.handle('people:assign-devices', (_e, { personId, deviceIds }: any) => {
    for (const deviceId of deviceIds) {
      const existing = queryOne('SELECT id FROM person_devices WHERE person_id = ? AND device_id = ?', [personId, deviceId]);
      if (!existing) {
        run('INSERT INTO person_devices (id, person_id, device_id) VALUES (?,?,?)', [uuid(), personId, deviceId]);
      }
    }
  });

  ipcMain.handle('people:unassign-device', (_e, { personId, deviceId }: any) => {
    run('DELETE FROM person_devices WHERE person_id = ? AND device_id = ?', [personId, deviceId]);
  });

  ipcMain.handle('people:sync-to-device', async (_e, { personId, deviceId }: any) => {
    const person = queryOne('SELECT * FROM people WHERE id = ?', [personId]);
    if (!person) throw new Error('Person not found');
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [deviceId]);
    if (!device) throw new Error('Device not found');
    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) throw new Error('No adapter');
    // Control iD specific: add user to device
    const conn: DeviceConnection = { ip: device.ip_address, port: device.port,
      username: device.username || 'admin', password: device.cred_password ? decrypt(device.cred_password) : '' };
    // Use getConfig/setConfig or direct API calls through adapter
    // For Control iD, we use the legacy API
    const controlId = adapter as any;
    if (controlId.httpRequest) {
      const proto = device.port === 443 ? 'https' : 'http';
      const loginRes = await controlId.httpRequest(proto, device.ip_address, device.port, '/login.fcgi',
        JSON.stringify({ login: conn.username, password: conn.password }), 10000);
      if (loginRes?.session) {
        await controlId.httpRequest(proto, device.ip_address, device.port, '/create_objects.fcgi',
          JSON.stringify({ object: 'users', values: [{ id: parseInt(person.registration, 10), name: person.name, registration: person.registration }] }), 10000, loginRes.session);
        if (person.card_number) {
          await controlId.httpRequest(proto, device.ip_address, device.port, '/create_objects.fcgi',
            JSON.stringify({ object: 'cards', values: [{ user_id: parseInt(person.registration, 10), value: parseInt(person.card_number, 10) }] }), 10000, loginRes.session);
        }
        await controlId.httpRequest(proto, device.ip_address, device.port, '/logout.fcgi', '{}', 5000, loginRes.session).catch(() => {});
        run("UPDATE person_devices SET synced = 1, synced_at = datetime('now') WHERE person_id = ? AND device_id = ?", [personId, deviceId]);
        return true;
      }
    }
    throw new Error('Sync failed');
  });

  ipcMain.handle('people:batch-sync', async (_e, { personIds, deviceIds }: any) => {
    return jobService.createJob('sync_people', `Sync ${personIds.length} people to ${deviceIds.length} devices`, deviceIds,
      async (conn, device) => {
        const adapter = adapterRegistry.get(device.manufacturer) as any;
        if (!adapter?.httpRequest) throw new Error('No adapter');
        const proto = device.port === 443 ? 'https' : 'http';
        const loginRes = await adapter.httpRequest(proto, device.ip_address, device.port, '/login.fcgi',
          JSON.stringify({ login: conn.username, password: conn.password }), 10000);
        if (!loginRes?.session) throw new Error('Auth failed');
        let synced = 0;
        for (const personId of personIds) {
          const person = queryOne('SELECT * FROM people WHERE id = ?', [personId]);
          if (!person) continue;
          await adapter.httpRequest(proto, device.ip_address, device.port, '/create_objects.fcgi',
            JSON.stringify({ object: 'users', values: [{ id: parseInt(person.registration, 10), name: person.name, registration: person.registration }] }), 10000, loginRes.session);
          if (person.card_number) {
            await adapter.httpRequest(proto, device.ip_address, device.port, '/create_objects.fcgi',
              JSON.stringify({ object: 'cards', values: [{ user_id: parseInt(person.registration, 10), value: parseInt(person.card_number, 10) }] }), 10000, loginRes.session);
          }
          run("UPDATE person_devices SET synced = 1, synced_at = datetime('now') WHERE person_id = ? AND device_id = ?", [personId, device.id]);
          synced++;
        }
        await adapter.httpRequest(proto, device.ip_address, device.port, '/logout.fcgi', '{}', 5000, loginRes.session).catch(() => {});
        return `Synced ${synced} people`;
      }, getWindow());
  });

  // ─── Jobs ───────────────────────────────────────────────────────

  ipcMain.handle('jobs:list', () => jobService.listJobs());

  ipcMain.handle('jobs:get', (_e, id: string) => jobService.getJob(id));

  ipcMain.handle('jobs:cancel', (_e, id: string) => jobService.cancelJob(id));

  // ─── Audit Logs ─────────────────────────────────────────────────

  ipcMain.handle('audit:list', (_e, { limit = 100, offset = 0, category }: any) => {
    if (category) {
      return query('SELECT * FROM audit_logs WHERE category=? ORDER BY created_at DESC LIMIT ? OFFSET ?', [category, limit, offset]);
    }
    return query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  });

  // ─── Groups ─────────────────────────────────────────────────────

  ipcMain.handle('groups:list', () => query('SELECT * FROM device_groups ORDER BY name'));

  ipcMain.handle('groups:create', (_e, { name, color }: any) => {
    const id = uuid();
    run('INSERT INTO device_groups (id, name, color) VALUES (?,?,?)', [id, name, color || null]);
    return queryOne('SELECT * FROM device_groups WHERE id = ?', [id]);
  });

  ipcMain.handle('groups:delete', (_e, id: string) => {
    run('DELETE FROM device_groups WHERE id = ?', [id]);
  });

  // ─── Dashboard ──────────────────────────────────────────────────

  ipcMain.handle('dashboard:stats', () => {
    return {
      devices: {
        total: count('SELECT COUNT(*) as c FROM devices'),
        online: count("SELECT COUNT(*) as c FROM devices WHERE status='online'"),
        offline: count("SELECT COUNT(*) as c FROM devices WHERE status='offline'"),
        error: count("SELECT COUNT(*) as c FROM devices WHERE status='error'"),
        unknown: count("SELECT COUNT(*) as c FROM devices WHERE status='unknown' OR status='unreachable'"),
      },
      recentAlerts: query("SELECT * FROM audit_logs WHERE severity IN ('warning','error','critical') ORDER BY created_at DESC LIMIT 10"),
      jobsRunning: count("SELECT COUNT(*) as c FROM jobs WHERE status='running'"),
      lastScanAt: queryOne("SELECT completed_at FROM jobs WHERE type='discovery' AND status='completed' ORDER BY completed_at DESC LIMIT 1")?.completed_at ?? null,
    };
  });

  // ─── Config backup/restore ──────────────────────────────────────

  ipcMain.handle('config:backup', async (_e, deviceId: string) => {
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [deviceId]);
    if (!device) throw new Error('Device not found');
    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) throw new Error('No adapter');
    const conn: DeviceConnection = { ip: device.ip_address, port: device.port,
      username: device.username || 'admin', password: device.cred_password ? decrypt(device.cred_password) : '' };
    const config = await adapter.getConfig(conn);
    const version = count('SELECT COUNT(*) as c FROM config_backups WHERE device_id = ?', [deviceId]) + 1;
    const id = uuid();
    run(`INSERT INTO config_backups (id, device_id, device_name, config, version) VALUES (?,?,?,?,?)`,
      [id, deviceId, device.name, JSON.stringify(config), version]);
    run(`INSERT INTO audit_logs (id, action, category, device_id, device_name, details, severity) VALUES (?,?,?,?,?,?,?)`,
      [uuid(), 'config_backup', 'config', deviceId, device.name, `Backup v${version}`, 'info']);
    return queryOne('SELECT * FROM config_backups WHERE id = ?', [id]);
  });

  ipcMain.handle('config:backups', (_e, deviceId: string) => {
    return query('SELECT * FROM config_backups WHERE device_id = ? ORDER BY version DESC', [deviceId]);
  });

  ipcMain.handle('config:restore', async (_e, { deviceId, backupId }: any) => {
    const backup = queryOne('SELECT * FROM config_backups WHERE id = ?', [backupId]);
    if (!backup) throw new Error('Backup not found');
    const device = queryOne(`SELECT d.*, c.username, c.password as cred_password
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id WHERE d.id = ?`, [deviceId]);
    if (!device) throw new Error('Device not found');
    const adapter = adapterRegistry.get(device.manufacturer);
    if (!adapter) throw new Error('No adapter');
    const conn: DeviceConnection = { ip: device.ip_address, port: device.port,
      username: device.username || 'admin', password: device.cred_password ? decrypt(device.cred_password) : '' };
    const config = JSON.parse(backup.config);
    const ok = await adapter.setConfig(conn, config);
    if (ok) {
      run(`INSERT INTO audit_logs (id, action, category, device_id, device_name, details, severity) VALUES (?,?,?,?,?,?,?)`,
        [uuid(), 'config_restore', 'config', deviceId, device.name, `Restored from backup v${backup.version}`, 'warning']);
    }
    return ok;
  });

  // ─── Shell ─────────────────────────────────────────────────────

  ipcMain.handle('shell:open-url', (_e, url: string) => {
    // Only allow http/https URLs to prevent shell injection
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  // ─── Export ────────────────────────────────────────────────────

  ipcMain.handle('export:devices-csv', async () => {
    const win = getWindow();
    if (!win) return false;

    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Devices',
      defaultPath: `devices_${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (!filePath) return false;

    const devices = query(`SELECT d.*, c.name as credential_name, g.name as group_name
      FROM devices d LEFT JOIN credentials c ON d.credential_id = c.id
      LEFT JOIN device_groups g ON d.group_id = g.id ORDER BY d.name ASC`);

    const headers = ['Name', 'IP Address', 'Port', 'Model', 'Serial Number', 'MAC Address',
      'Firmware', 'Status', 'Manufacturer', 'Hostname', 'HTTPS', 'DHCP', 'Credential',
      'Group', 'Last Heartbeat', 'Notes'];

    const rows = devices.map((d: any) => [
      d.name, d.ip_address, d.port, d.model, d.serial_number, d.mac_address,
      d.firmware_version, d.status, d.manufacturer, d.hostname,
      d.https_enabled ? 'Yes' : 'No', d.dhcp_enabled ? 'Yes' : 'No',
      d.credential_name || '', d.group_name || '',
      d.last_heartbeat || '', d.notes || '',
    ]);

    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map(escape).join(','))].join('\n');
    fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf-8'); // BOM for Excel compatibility
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle('export:audit-csv', async () => {
    const win = getWindow();
    if (!win) return false;

    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Audit Log',
      defaultPath: `audit_log_${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (!filePath) return false;

    const logs = query('SELECT * FROM audit_logs ORDER BY created_at DESC');
    const headers = ['Timestamp', 'Action', 'Category', 'Severity', 'Device', 'Details'];
    const rows = logs.map((l: any) => [l.created_at, l.action, l.category, l.severity, l.device_name || '', l.details || '']);
    const escape = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map(escape).join(','))].join('\n');
    fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf-8');
    shell.showItemInFolder(filePath);
    return true;
  });
}
