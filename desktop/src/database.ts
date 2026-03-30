import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
// @ts-ignore - sql.js has no bundled types
import initSqlJs from 'sql.js';
type SqlJsDatabase = any;

// ─── Paths ───────────────────────────────────────────────────────
const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..');

const dbPath = path.join(userDataPath, 'controlid.db');

process.env.JWT_SECRET = 'controlid-desktop-jwt-secret-key-2024';
process.env.ENCRYPTION_KEY = 'controlid-desktop-encryption-key!!';

// ─── Database singleton ──────────────────────────────────────────
let _db: SqlJsDatabase;

export function getDb(): SqlJsDatabase {
  return _db;
}

// Save database to disk
export function saveDb(): void {
  if (_db) {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// ─── Initialize ──────────────────────────────────────────────────
export async function initDatabase(): Promise<void> {
  // Resolve WASM file path
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  const dbExists = fs.existsSync(dbPath);

  if (dbExists) {
    const fileBuffer = fs.readFileSync(dbPath);
    _db = new SQL.Database(fileBuffer);
    console.log('[DB] Database loaded from:', dbPath);
  } else {
    _db = new SQL.Database();
    console.log('[DB] Creating new database at:', dbPath);
  }

  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA foreign_keys = ON');

  createTables();

  if (!dbExists) {
    await seed();
    saveDb();
    console.log('[DB] Database created and seeded');
  }

  // Auto-save every 30 seconds
  setInterval(() => saveDb(), 30000);

  // Save on exit
  process.on('exit', () => saveDb());
  process.on('SIGINT', () => { saveDb(); process.exit(); });
}

function createTables(): void {
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OPERATOR',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS person_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial_number TEXT UNIQUE NOT NULL,
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 443,
      login TEXT NOT NULL DEFAULT 'admin',
      password TEXT NOT NULL,
      firmware_version TEXT,
      status TEXT NOT NULL DEFAULT 'OFFLINE',
      last_sync_at TEXT,
      last_heartbeat TEXT,
      location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      registration TEXT UNIQUE NOT NULL,
      card_number TEXT,
      pin_code TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      group_id TEXT REFERENCES person_groups(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS person_devices (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      synced INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(person_id, device_id)
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS access_rules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES person_groups(id) ON DELETE SET NULL,
      time_zone TEXT NOT NULL DEFAULT '*',
      days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
      start_time TEXT NOT NULL DEFAULT '00:00',
      end_time TEXT NOT NULL DEFAULT '23:59',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      event TEXT NOT NULL,
      method TEXT,
      accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      details TEXT
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function seed(): Promise<void> {
  const hashedPassword = await bcrypt.hash('admin123', 12);
  _db.run(
    `INSERT OR IGNORE INTO users (id, email, password, name, role, active) VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), 'admin@controlid.com', hashedPassword, 'Administrator', 'ADMIN', 1]
  );
  _db.run(
    `INSERT OR IGNORE INTO locations (id, name, address) VALUES (?, ?, ?)`,
    [crypto.randomUUID(), 'Main Office', 'Rua Example, 123 - São Paulo, SP']
  );
}
