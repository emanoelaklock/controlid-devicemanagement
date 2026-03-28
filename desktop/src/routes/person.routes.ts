import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const personSchema = z.object({
  name: z.string().min(1).max(200), registration: z.string().min(1).max(50),
  cardNumber: z.string().max(20).optional(), pinCode: z.string().max(10).optional(),
  active: z.boolean().default(true), groupId: z.string().uuid().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { search, groupId, active } = req.query;
  const where: Record<string, unknown> = {};
  if (search) where.OR = [{ name: { contains: search as string } }, { registration: { contains: search as string } }];
  if (groupId) where.groupId = groupId;
  if (active !== undefined) where.active = active === 'true';
  const people = await prisma.person.findMany({
    where, include: { group: true, devices: { include: { device: { select: { id: true, name: true } } } } }, orderBy: { name: 'asc' },
  });
  res.json(people);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const person = await prisma.person.findUnique({
    where: { id: req.params.id },
    include: { group: true, devices: { include: { device: { select: { id: true, name: true, status: true } } } } },
  });
  if (!person) throw new AppError(404, 'Person not found');
  res.json(person);
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.parse(req.body);
  const person = await prisma.person.create({ data, include: { group: true } });
  res.status(201).json(person);
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.partial().parse(req.body);
  const person = await prisma.person.update({ where: { id: req.params.id }, data, include: { group: true } });
  res.json(person);
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.person.delete({ where: { id: req.params.id } });
  res.json({ message: 'Person deleted' });
}));

router.post('/:id/assign-devices', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const { deviceIds } = z.object({ deviceIds: z.array(z.string().uuid()) }).parse(req.body);
  const created = await Promise.all(deviceIds.map((deviceId) =>
    prisma.personDevice.upsert({
      where: { personId_deviceId: { personId: req.params.id, deviceId } },
      update: { synced: false }, create: { personId: req.params.id, deviceId },
    })
  ));
  res.json({ assigned: created.length });
}));

export { router as personRouter };
