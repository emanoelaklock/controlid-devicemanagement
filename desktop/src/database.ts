// ═══════════════════════════════════════════════════════════════════
// CRITICAL: This file uses require() instead of import for PrismaClient.
// TypeScript hoists import statements above all code, which means
// environment variables would not be set before PrismaClient loads.
// PrismaClient reads DATABASE_URL and resolves .prisma/client at
// require() time, so env vars MUST be set first.
// ═══════════════════════════════════════════════════════════════════

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

// ─── 1. Compute paths ────────────────────────────────────────────
const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..');

const dbPath = path.join(userDataPath, 'controlid.db');

// ─── 2. Set env vars BEFORE PrismaClient is loaded ───────────────
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = 'controlid-desktop-jwt-secret-key-2024';
process.env.ENCRYPTION_KEY = 'controlid-desktop-encryption-key!!';

// ─── 3. Fix Prisma engine path for packaged app ──────────────────
if (app.isPackaged) {
  // With asar:false, the app is at resources/app/
  const appRoot = path.join(process.resourcesPath, 'app');
  const prismaClientDir = path.join(appRoot, 'node_modules', '.prisma', 'client');

  console.log('[Prisma] Looking for engine in:', prismaClientDir);
  console.log('[Prisma] Directory exists:', fs.existsSync(prismaClientDir));

  if (fs.existsSync(prismaClientDir)) {
    const files = fs.readdirSync(prismaClientDir);
    console.log('[Prisma] Files in .prisma/client:', files);

    const engineFile = files.find(
      (f) => f.endsWith('.dll.node') || f.endsWith('.so.node') || f.includes('query_engine')
    );
    if (engineFile) {
      const enginePath = path.join(prismaClientDir, engineFile);
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
      console.log('[Prisma] Engine path set to:', enginePath);
    }
  }
}

// ─── 4. NOW load PrismaClient via require() (not hoisted) ────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

export const prisma = new PrismaClient({
  log: app.isPackaged ? [] : ['query', 'info', 'warn', 'error'],
});

// ─── 5. Database initialization ──────────────────────────────────
export async function initDatabase(): Promise<void> {
  const dbExists = fs.existsSync(dbPath);

  if (!dbExists) {
    console.log('[DB] Creating new database at:', dbPath);
    await createTables();
    await seed();
    console.log('[DB] Database created and seeded successfully');
  } else {
    console.log('[DB] Database exists at:', dbPath);
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      console.log('[DB] Connection verified');
    } catch (error) {
      console.error('[DB] Connection failed:', error);
      throw error;
    }
  }
}

async function createTables(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OPERATOR',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS person_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS devices (
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
      last_sync_at DATETIME,
      last_heartbeat DATETIME,
      location_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      registration TEXT UNIQUE NOT NULL,
      card_number TEXT,
      pin_code TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      group_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES person_groups(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS person_devices (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS person_devices_person_id_device_id_key ON person_devices(person_id, device_id)`,
    `CREATE TABLE IF NOT EXISTS access_rules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      device_id TEXT NOT NULL,
      group_id TEXT,
      time_zone TEXT NOT NULL DEFAULT '*',
      days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
      start_time TEXT NOT NULL DEFAULT '00:00',
      end_time TEXT NOT NULL DEFAULT '23:59',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES person_groups(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL,
      person_id TEXT,
      event TEXT NOT NULL,
      method TEXT,
      accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      device_id TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    )`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
}

async function seed(): Promise<void> {
  const crypto = await import('crypto');

  const hashedPassword = await bcrypt.hash('admin123', 12);
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO users (id, email, password, name, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    crypto.randomUUID(),
    'admin@controlid.com',
    hashedPassword,
    'Administrator',
    'ADMIN',
    1
  );

  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO locations (id, name, address, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    crypto.randomUUID(),
    'Main Office',
    'Rua Example, 123 - São Paulo, SP'
  );
}
