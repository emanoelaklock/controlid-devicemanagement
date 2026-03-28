import { Router } from 'express';
import { prisma } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { deviceId, personId, event, startDate, endDate, page = '1', limit = '50' } = req.query;
  const where: Record<string, unknown> = {};
  if (deviceId) where.deviceId = deviceId;
  if (personId) where.personId = personId;
  if (event) where.event = event;
  if (startDate || endDate) {
    where.accessedAt = {};
    if (startDate) (where.accessedAt as Record<string, unknown>).gte = new Date(startDate as string);
    if (endDate) (where.accessedAt as Record<string, unknown>).lte = new Date(endDate as string);
  }
  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 200);
  const [logs, total] = await Promise.all([
    prisma.accessLog.findMany({
      where, include: { device: { select: { id: true, name: true } }, person: { select: { id: true, name: true, registration: true } } },
      orderBy: { accessedAt: 'desc' }, skip: (pageNum - 1) * limitNum, take: limitNum,
    }),
    prisma.accessLog.count({ where }),
  ]);
  res.json({ data: logs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
}));

export { router as accessLogRouter };
