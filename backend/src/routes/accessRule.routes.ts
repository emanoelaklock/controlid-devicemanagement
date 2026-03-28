import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

const accessRuleSchema = z.object({
  name: z.string().min(1).max(100),
  deviceId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  timeZone: z.string().default('*'),
  daysOfWeek: z.string().default('1,2,3,4,5,6,7'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),
  active: z.boolean().default(true),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { deviceId } = req.query;
    const where = deviceId ? { deviceId: deviceId as string } : {};

    const rules = await prisma.accessRule.findMany({
      where,
      include: { device: { select: { id: true, name: true } }, group: true },
      orderBy: { name: 'asc' },
    });
    res.json(rules);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rule = await prisma.accessRule.findUnique({
      where: { id: req.params.id },
      include: { device: true, group: true },
    });
    if (!rule) throw new AppError(404, 'Access rule not found');
    res.json(rule);
  })
);

router.post(
  '/',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const data = accessRuleSchema.parse(req.body);
    const rule = await prisma.accessRule.create({
      data,
      include: { device: { select: { id: true, name: true } }, group: true },
    });
    res.status(201).json(rule);
  })
);

router.put(
  '/:id',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const data = accessRuleSchema.partial().parse(req.body);
    const rule = await prisma.accessRule.update({
      where: { id: req.params.id },
      data,
      include: { device: { select: { id: true, name: true } }, group: true },
    });
    res.json(rule);
  })
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.accessRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Access rule deleted' });
  })
);

export { router as accessRuleRouter };
