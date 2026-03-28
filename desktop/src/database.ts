import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import BetterSqlite3 from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ─── Paths ───────────────────────────────────────────────────────
const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..');

const dbPath = path.join(userDataPath, 'controlid.db');

process.env.JWT_SECRET = 'controlid-desktop-jwt-secret-key-2024';
process.env.ENCRYPTION_KEY = 'controlid-desktop-encryption-key!!';

// ─── Database singleton ──────────────────────────────────────────
let _db: BetterSqlite3.Database;

export function getDb(): BetterSqlite3.Database {
  if (!_db) {
    _db = new BetterSqlite3(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

// ─── Initialize ──────────────────────────────────────────────────
export async function initDatabase(): Promise<void> {
  const dbExists = fs.existsSync(dbPath);
  const db = getDb();

  createTables(db);

  if (!dbExists) {
    await seed(db);
    console.log('[DB] Database created and seeded at:', dbPath);
  } else {
    console.log('[DB] Database loaded from:', dbPath);
  }
}

function createTables(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OPERATOR',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS person_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
    );
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
    );
    CREATE TABLE IF NOT EXISTS person_devices (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      synced INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(person_id, device_id)
    );
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
    );
    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      event TEXT NOT NULL,
      method TEXT,
      accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      details TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function seed(db: BetterSqlite3.Database): Promise<void> {
  const hashedPassword = await bcrypt.hash('admin123', 12);

  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password, name, role, active) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), 'admin@controlid.com', hashedPassword, 'Administrator', 'ADMIN', 1);

  db.prepare(
    `INSERT OR IGNORE INTO locations (id, name, address) VALUES (?, ?, ?)`
  ).run(crypto.randomUUID(), 'Main Office', 'Rua Example, 123 - São Paulo, SP');
}
