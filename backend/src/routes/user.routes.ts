import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog } from '../services/audit.service';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(authorize('ADMIN'));

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(200),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'),
  active: z.boolean().default(true),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = userSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: { ...data, password: hashedPassword },
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'user',
      entityId: user.id,
      details: `User "${user.name}" created`,
    });

    res.status(201).json(user);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = userSchema.partial().parse(req.body);

    const updateData: Record<string, unknown> = { ...data };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'user',
      entityId: user.id,
    });

    res.json(user);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.userId) {
      throw new AppError(400, 'Cannot delete your own account');
    }

    const user = await prisma.user.delete({ where: { id: req.params.id } });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'user',
      entityId: user.id,
      details: `User "${user.name}" deleted`,
    });

    res.json({ message: 'User deleted' });
  })
);

export { router as userRouter };
