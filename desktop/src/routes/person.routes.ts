import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, queryOne, run } from '../utils/db-helpers';
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
  let sql = `SELECT p.*, g.name as group_name FROM people p LEFT JOIN person_groups g ON p.group_id = g.id WHERE 1=1`;
  const params: any[] = [];
  if (search) { sql += ` AND (p.name LIKE ? OR p.registration LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (groupId) { sql += ` AND p.group_id = ?`; params.push(groupId); }
  if (active !== undefined) { sql += ` AND p.active = ?`; params.push(active === 'true' ? 1 : 0); }
  sql += ` ORDER BY p.name ASC`;
  const people = query(sql, params);
  res.json(people.map((p: any) => {
    const devices = query(`SELECT d.id, d.name FROM person_devices pd JOIN devices d ON pd.device_id = d.id WHERE pd.person_id = ?`, [p.id]);
    return { ...p, active: !!p.active, group: p.group_name ? { name: p.group_name } : null, devices: devices.map((d: any) => ({ device: d })) };
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const person = queryOne('SELECT p.*, g.name as group_name FROM people p LEFT JOIN person_groups g ON p.group_id = g.id WHERE p.id = ?', [req.params.id]);
  if (!person) throw new AppError(404, 'Person not found');
  const devices = query(`SELECT d.id, d.name, d.status FROM person_devices pd JOIN devices d ON pd.device_id = d.id WHERE pd.person_id = ?`, [req.params.id]);
  res.json({ ...person, active: !!person.active, group: person.group_name ? { name: person.group_name } : null, devices: devices.map((d: any) => ({ device: d })) });
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.parse(req.body);
  const id = crypto.randomUUID();
  run(`INSERT INTO people (id, name, registration, card_number, pin_code, active, group_id) VALUES (?,?,?,?,?,?,?)`,
    [id, data.name, data.registration, data.cardNumber || null, data.pinCode || null, data.active ? 1 : 0, data.groupId || null]);
  res.status(201).json(queryOne('SELECT * FROM people WHERE id = ?', [id]));
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = personSchema.partial().parse(req.body);
  const existing = queryOne('SELECT * FROM people WHERE id = ?', [req.params.id]);
  if (!existing) throw new AppError(404, 'Person not found');
  run(`UPDATE people SET name=?, registration=?, card_number=?, pin_code=?, active=?, group_id=?, updated_at=datetime('now') WHERE id=?`,
    [data.name ?? existing.name, data.registration ?? existing.registration, data.cardNumber ?? existing.card_number,
     data.pinCode ?? existing.pin_code, data.active !== undefined ? (data.active ? 1 : 0) : existing.active, data.groupId ?? existing.group_id, req.params.id]);
  res.json(queryOne('SELECT * FROM people WHERE id = ?', [req.params.id]));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  run('DELETE FROM people WHERE id = ?', [req.params.id]);
  res.json({ message: 'Person deleted' });
}));

router.post('/:id/assign-devices', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const { deviceIds } = z.object({ deviceIds: z.array(z.string().uuid()) }).parse(req.body);
  for (const deviceId of deviceIds) { run(`INSERT OR REPLACE INTO person_devices (id, person_id, device_id, synced) VALUES (?,?,?,0)`, [crypto.randomUUID(), req.params.id, deviceId]); }
  res.json({ assigned: deviceIds.length });
}));

export { router as personRouter };
