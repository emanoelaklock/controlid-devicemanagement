import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne } from '../utils/db-helpers';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, AuthPayload } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !user.active) throw new AppError(401, 'Invalid credentials');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new AppError(401, 'Invalid credentials');
  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = queryOne('SELECT id, email, name, role FROM users WHERE id = ?', [req.user!.userId]);
  if (!user) throw new AppError(404, 'User not found');
  res.json(user);
}));

export { router as authRouter };
