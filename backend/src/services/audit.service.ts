import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuditEntry {
  userId?: string;
  deviceId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({ data: entry });
}
