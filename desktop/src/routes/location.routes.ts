import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const locationSchema = z.object({ name: z.string().min(1).max(100), address: z.string().max(300).optional() });

router.get('/', asyncHandler(async (_req, res) => {
  const db = getDb();
  const locations = db.prepare('SELECT * FROM locations ORDER BY name ASC').all() as any[];
  const result = locations.map(loc => {
    const devices = db.prepare('SELECT id, name, status FROM devices WHERE location_id = ?').all(loc.id);
    return { ...loc, devices };
  });
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id) as any;
  if (!location) throw new AppError(404, 'Location not found');
  location.devices = db.prepare('SELECT * FROM devices WHERE location_id = ?').all(req.params.id);
  res.json(location);
}));

router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const data = locationSchema.parse(req.body);
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO locations (id, name, address) VALUES (?, ?, ?)').run(id, data.name, data.address || null);
  res.status(201).json(getDb().prepare('SELECT * FROM locations WHERE id = ?').get(id));
}));

router.put('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const data = locationSchema.partial().parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id) as any;
  if (!existing) throw new AppError(404, 'Location not found');
  db.prepare("UPDATE locations SET name=?, address=?, updated_at=datetime('now') WHERE id=?")
    .run(data.name ?? existing.name, data.address ?? existing.address, req.params.id);
  res.json(db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  getDb().prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  res.json({ message: 'Location deleted' });
}));

export { router as locationRouter };
