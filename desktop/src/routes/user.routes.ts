import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, queryOne, run } from '../utils/db-helpers';
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
  res.json(query('SELECT id, email, name, role, active, created_at FROM users ORDER BY name ASC').map((u: any) => ({ ...u, active: !!u.active })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = userSchema.parse(req.body);
  const id = crypto.randomUUID();
  const hashed = await bcrypt.hash(data.password, 12);
  run('INSERT INTO users (id,email,password,name,role,active) VALUES (?,?,?,?,?,?)', [id, data.email, hashed, data.name, data.role, data.active ? 1 : 0]);
  const user = queryOne('SELECT id,email,name,role,active FROM users WHERE id=?', [id]);
  res.status(201).json({ ...user, active: !!user.active });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = userSchema.partial().parse(req.body);
  const e = queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!e) throw new AppError(404, 'User not found');
  const pw = data.password ? await bcrypt.hash(data.password, 12) : e.password;
  run("UPDATE users SET email=?,password=?,name=?,role=?,active=?,updated_at=datetime('now') WHERE id=?",
    [data.email??e.email, pw, data.name??e.name, data.role??e.role, data.active!==undefined?(data.active?1:0):e.active, req.params.id]);
  const user = queryOne('SELECT id,email,name,role,active FROM users WHERE id=?', [req.params.id]);
  res.json({ ...user, active: !!user.active });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.userId) throw new AppError(400, 'Cannot delete your own account');
  run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
}));

export { router as userRouter };
