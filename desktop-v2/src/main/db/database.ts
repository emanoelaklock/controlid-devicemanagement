import { app } from 'electron';
import path from 'path';
import fs from 'fs';
// @ts-ignore
import initSqlJs from 'sql.js';

let _db: any;
let _dbPath: string;

export function getDb(): any {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

export function saveDb(): void {
  if (_db) {
    const data = _db.export();
    fs.writeFileSync(_dbPath, Buffer.from(data));
  }
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..', '..');
  _dbPath = path.join(userDataPath, 'controlid-dm.db');

  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  if (fs.existsSync(_dbPath)) {
    _db = new SQL.Database(fs.readFileSync(_dbPath));
    console.log('[DB] Loaded from:', _dbPath);
  } else {
    _db = new SQL.Database();
    console.log('[DB] Created new database at:', _dbPath);
  }

  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA foreign_keys = ON');

  createSchema();
  saveDb();

  // Auto-save
  setInterval(() => saveDb(), 15000);
  process.on('exit', () => saveDb());
}

function createSchema(): void {
  _db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT NOT NULL DEFAULT 'controlid',
      model TEXT NOT NULL DEFAULT '',
      serial_number TEXT NOT NULL DEFAULT '',
      mac_address TEXT,
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 443,
      hostname TEXT,
      firmware_version TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_seen TEXT,
      last_heartbeat TEXT,
      credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL,
      group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL,
      tags TEXT,
      notes TEXT,
      https_enabled INTEGER NOT NULL DEFAULT 0,
      dhcp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT 'admin',
      password TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS device_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      created_by TEXT
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS job_items (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT,
      started_at TEXT,
      completed_at TEXT
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'system',
      device_id TEXT,
      device_name TEXT,
      details TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS config_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      model TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS config_backups (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_job_items_job ON job_items(job_id)`);
}
