import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../database';
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
  const users = getDb().prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY name ASC').all() as any[];
  res.json(users.map(u => ({ ...u, active: !!u.active })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = userSchema.parse(req.body);
  const id = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(data.password, 12);
  getDb().prepare('INSERT INTO users (id, email, password, name, role, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.email, hashedPassword, data.name, data.role, data.active ? 1 : 0);
  const user = getDb().prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(id) as any;
  res.status(201).json({ ...user, active: !!user.active });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = userSchema.partial().parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!existing) throw new AppError(404, 'User not found');
  const password = data.password ? await bcrypt.hash(data.password, 12) : existing.password;
  db.prepare("UPDATE users SET email=?, password=?, name=?, role=?, active=?, updated_at=datetime('now') WHERE id=?")
    .run(data.email ?? existing.email, password, data.name ?? existing.name, data.role ?? existing.role,
      data.active !== undefined ? (data.active ? 1 : 0) : existing.active, req.params.id);
  const user = db.prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(req.params.id) as any;
  res.json({ ...user, active: !!user.active });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.userId) throw new AppError(400, 'Cannot delete your own account');
  getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
}));

export { router as userRouter };
