import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [
      totalDevices,
      onlineDevices,
      offlineDevices,
      errorDevices,
      totalPeople,
      activePeople,
      totalLocations,
      recentAccessLogs,
    ] = await Promise.all([
      prisma.device.count(),
      prisma.device.count({ where: { status: 'ONLINE' } }),
      prisma.device.count({ where: { status: 'OFFLINE' } }),
      prisma.device.count({ where: { status: 'ERROR' } }),
      prisma.person.count(),
      prisma.person.count({ where: { active: true } }),
      prisma.location.count(),
      prisma.accessLog.count({
        where: { accessedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ]);

    res.json({
      devices: { total: totalDevices, online: onlineDevices, offline: offlineDevices, error: errorDevices },
      people: { total: totalPeople, active: activePeople },
      locations: totalLocations,
      accessLogsLast24h: recentAccessLogs,
    });
  })
);

router.get(
  '/recent-activity',
  asyncHandler(async (_req, res) => {
    const [recentAccess, recentAudit] = await Promise.all([
      prisma.accessLog.findMany({
        include: {
          device: { select: { name: true } },
          person: { select: { name: true } },
        },
        orderBy: { accessedAt: 'desc' },
        take: 20,
      }),
      prisma.auditLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    res.json({ recentAccess, recentAudit });
  })
);

export { router as dashboardRouter };
