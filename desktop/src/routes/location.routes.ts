import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const locationSchema = z.object({ name: z.string().min(1).max(100), address: z.string().max(300).optional() });

router.get('/', asyncHandler(async (_req, res) => {
  const locations = await prisma.location.findMany({
    include: { devices: { select: { id: true, name: true, status: true } } }, orderBy: { name: 'asc' },
  });
  res.json(locations);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const location = await prisma.location.findUnique({ where: { id: req.params.id }, include: { devices: true } });
  if (!location) throw new AppError(404, 'Location not found');
  res.json(location);
}));

router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const data = locationSchema.parse(req.body);
  const location = await prisma.location.create({ data });
  res.status(201).json(location);
}));

router.put('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const data = locationSchema.partial().parse(req.body);
  const location = await prisma.location.update({ where: { id: req.params.id }, data });
  res.json(location);
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.location.delete({ where: { id: req.params.id } });
  res.json({ message: 'Location deleted' });
}));

export { router as locationRouter };
