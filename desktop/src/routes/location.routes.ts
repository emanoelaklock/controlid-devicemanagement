import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, queryOne, run } from '../utils/db-helpers';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
  const locations = query('SELECT * FROM locations ORDER BY name ASC');
  res.json(locations.map((loc: any) => ({
    ...loc, devices: query('SELECT id, name, status FROM devices WHERE location_id = ?', [loc.id]),
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const location = queryOne('SELECT * FROM locations WHERE id = ?', [req.params.id]);
  if (!location) throw new AppError(404, 'Location not found');
  res.json({ ...location, devices: query('SELECT * FROM devices WHERE location_id = ?', [req.params.id]) });
}));

router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const { name, address } = z.object({ name: z.string().min(1).max(100), address: z.string().max(300).optional() }).parse(req.body);
  const id = crypto.randomUUID();
  run('INSERT INTO locations (id, name, address) VALUES (?,?,?)', [id, name, address || null]);
  res.status(201).json(queryOne('SELECT * FROM locations WHERE id = ?', [id]));
}));

router.put('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().min(1).max(100).optional(), address: z.string().max(300).optional() }).parse(req.body);
  const existing = queryOne('SELECT * FROM locations WHERE id = ?', [req.params.id]);
  if (!existing) throw new AppError(404, 'Location not found');
  run("UPDATE locations SET name=?, address=?, updated_at=datetime('now') WHERE id=?", [data.name ?? existing.name, data.address ?? existing.address, req.params.id]);
  res.json(queryOne('SELECT * FROM locations WHERE id = ?', [req.params.id]));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  run('DELETE FROM locations WHERE id = ?', [req.params.id]);
  res.json({ message: 'Location deleted' });
}));

export { router as locationRouter };
