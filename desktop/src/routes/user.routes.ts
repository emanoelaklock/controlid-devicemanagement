import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN'));

const userSchema = z.object({
  email: z.string().email(), password: z.string().min(8), name: z.string().min(1).max(200),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'), active: z.boolean().default(true),
});

router.get('/', asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }, orderBy: { name: 'asc' },
  });
  res.json(users);
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = userSchema.parse(req.body);
  const hashedPassword = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { ...data, password: hashedPassword },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  res.status(201).json(user);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = userSchema.partial().parse(req.body);
  const updateData: Record<string, unknown> = { ...data };
  if (data.password) updateData.password = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.update({
    where: { id: req.params.id }, data: updateData,
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  res.json(user);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.userId) throw new AppError(400, 'Cannot delete your own account');
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'User deleted' });
}));

export { router as userRouter };
