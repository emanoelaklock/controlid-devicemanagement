import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../database';
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
  const db = getDb();
  let sql = `SELECT p.*, g.name as group_name FROM people p LEFT JOIN person_groups g ON p.group_id = g.id WHERE 1=1`;
  const params: any[] = [];
  if (search) { sql += ` AND (p.name LIKE ? OR p.registration LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (groupId) { sql += ` AND p.group_id = ?`; params.push(groupId); }
  if (active !== undefined) { sql += ` AND p.active = ?`; params.push(active === 'true' ? 1 : 0); }
  sql += ` ORDER BY p.name ASC`;
  const people = db.prepare(sql).all(...params) as any[];
  const result = people.map(p => {
    const devices = db.prepare(`
      SELECT d.id, d.name FROM person_devices pd JOIN devices d ON pd.device_id = d.id WHERE pd.person_id = ?
    `).all(p.id) as any[];
    return { ...p, active: !!p.active, group: p.group_name ? { name: p.group_name } : null, devices: devices.map(d => ({ device: d })) };
  });
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const person = db.prepare('SELECT p.*, g.name as group_name FROM people p LEFT JOIN person_groups g ON p.group_id = g.id WHERE p.id = ?').get(req.params.id) as any;
  if (!person) throw new AppError(404, 'Person not found');
  const devices = db.prepare(`SELECT d.id, d.name, d.status FROM person_devices pd JOIN devices d ON pd.device_id = d.id WHERE pd.person_id = ?`).all(req.params.id) as any[];
  res.json({ ...person, active: !!person.active, group: person.group_name ? { name: person.group_name } : null, devices: devices.map(d => ({ device: d })) });
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.parse(req.body);
  const id = crypto.randomUUID();
  getDb().prepare(`INSERT INTO people (id, name, registration, card_number, pin_code, active, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, data.name, data.registration, data.cardNumber || null, data.pinCode || null, data.active ? 1 : 0, data.groupId || null);
  const person = getDb().prepare('SELECT * FROM people WHERE id = ?').get(id);
  res.status(201).json(person);
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.partial().parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id) as any;
  if (!existing) throw new AppError(404, 'Person not found');
  db.prepare(`UPDATE people SET name=?, registration=?, card_number=?, pin_code=?, active=?, group_id=?, updated_at=datetime('now') WHERE id=?`)
    .run(data.name ?? existing.name, data.registration ?? existing.registration, data.cardNumber ?? existing.card_number,
      data.pinCode ?? existing.pin_code, data.active !== undefined ? (data.active ? 1 : 0) : existing.active, data.groupId ?? existing.group_id, req.params.id);
  res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  getDb().prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ message: 'Person deleted' });
}));

router.post('/:id/assign-devices', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const { deviceIds } = z.object({ deviceIds: z.array(z.string().uuid()) }).parse(req.body);
  const db = getDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO person_devices (id, person_id, device_id, synced) VALUES (?, ?, ?, 0)`);
  for (const deviceId of deviceIds) { stmt.run(crypto.randomUUID(), req.params.id, deviceId); }
  res.json({ assigned: deviceIds.length });
}));

export { router as personRouter };
