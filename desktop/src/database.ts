import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';

const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..');

const dbPath = path.join(userDataPath, 'controlid.db');

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = 'controlid-desktop-jwt-secret-key-2024';
process.env.ENCRYPTION_KEY = 'controlid-desktop-encryption-key!!';

// Fix Prisma binary path in packaged app
if (app.isPackaged) {
  const prismaEnginesPath = path.join(
    process.resourcesPath,
    'prisma-engines'
  );
  if (fs.existsSync(prismaEnginesPath)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = findEngineFile(prismaEnginesPath);
  }
}

function findEngineFile(dir: string): string {
  const files = fs.readdirSync(dir, { recursive: true }) as string[];
  const engine = files.find(
    (f) => f.toString().includes('query_engine') && f.toString().endsWith('.node')
  );
  if (engine) return path.join(dir, engine.toString());

  // Fallback: search in client directory
  const clientDir = path.join(dir, 'client');
  if (fs.existsSync(clientDir)) {
    const clientFiles = fs.readdirSync(clientDir);
    const clientEngine = clientFiles.find((f) => f.endsWith('.node'));
    if (clientEngine) return path.join(clientDir, clientEngine);
  }
  return '';
}

export const prisma = new PrismaClient();

export async function initDatabase(): Promise<void> {
  const dbExists = fs.existsSync(dbPath);

  if (!dbExists) {
    // Create database using Prisma db push
    const schemaPath = app.isPackaged
      ? path.join(process.resourcesPath, 'prisma', 'schema.prisma')
      : path.join(__dirname, '..', 'prisma', 'schema.prisma');

    try {
      const prismaCliPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'prisma')
        : path.join(__dirname, '..', 'node_modules', '.bin', 'prisma');

      execSync(`"${prismaCliPath}" db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
        stdio: 'pipe',
        cwd: userDataPath,
      });
    } catch (error) {
      // Fallback: create tables manually via Prisma client
      console.error('Prisma db push failed, creating tables manually:', error);
      await createTablesManually();
    }

    await seed();
  }
}

async function createTablesManually(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'OPERATOR',
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial_number TEXT UNIQUE NOT NULL,
      ip_address TEXT NOT NULL,
      port INTEGER DEFAULT 443,
      login TEXT DEFAULT 'admin',
      password TEXT NOT NULL,
      firmware_version TEXT,
      status TEXT DEFAULT 'OFFLINE',
      last_sync_at DATETIME,
      last_heartbeat DATETIME,
      location_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (location_id) REFERENCES locations(id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      registration TEXT UNIQUE NOT NULL,
      card_number TEXT,
      pin_code TEXT,
      active BOOLEAN DEFAULT 1,
      group_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES person_groups(id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS person_groups (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS person_devices (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      synced BOOLEAN DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      UNIQUE(person_id, device_id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS access_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_id TEXT NOT NULL,
      group_id TEXT,
      time_zone TEXT DEFAULT '*',
      days_of_week TEXT DEFAULT '1,2,3,4,5,6,7',
      start_time TEXT DEFAULT '00:00',
      end_time TEXT DEFAULT '23:59',
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES person_groups(id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      person_id TEXT,
      event TEXT NOT NULL,
      method TEXT,
      accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      details TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (person_id) REFERENCES people(id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      device_id TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);
}

async function seed(): Promise<void> {
  const { randomUUID } = await import('crypto');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@controlid.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'admin@controlid.com',
        password: hashedPassword,
        name: 'Administrator',
        role: 'ADMIN',
      },
    });

    await prisma.location.create({
      data: {
        id: randomUUID(),
        name: 'Main Office',
        address: 'Rua Example, 123 - São Paulo, SP',
      },
    });

    console.log('Database seeded with default admin user');
  }
}
