import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '..');

const dbPath = path.join(userDataPath, 'controlid.db');

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = 'controlid-desktop-jwt-secret-key-2024';
process.env.ENCRYPTION_KEY = 'controlid-desktop-encryption-key!!';

export const prisma = new PrismaClient();

export async function initDatabase(): Promise<void> {
  const dbExists = fs.existsSync(dbPath);

  // Run migrations programmatically
  const { execSync } = await import('child_process');
  const prismaPath = app.isPackaged
    ? path.join(process.resourcesPath, 'prisma')
    : path.join(__dirname, '..', 'prisma');

  try {
    execSync(`npx prisma migrate deploy --schema="${path.join(prismaPath, 'schema.prisma')}"`, {
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
  } catch {
    // If migrate fails, try db push as fallback
    execSync(`npx prisma db push --schema="${path.join(prismaPath, 'schema.prisma')}" --skip-generate`, {
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
  }

  if (!dbExists) {
    await seed();
  }
}

async function seed(): Promise<void> {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@controlid.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: {
        email: 'admin@controlid.com',
        password: hashedPassword,
        name: 'Administrator',
        role: 'ADMIN',
      },
    });

    await prisma.location.create({
      data: {
        name: 'Main Office',
        address: 'Rua Example, 123 - São Paulo, SP',
      },
    });

    console.log('Database seeded with default admin user');
  }
}
