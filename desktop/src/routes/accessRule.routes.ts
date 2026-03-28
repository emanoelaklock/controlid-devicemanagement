import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const accessRuleSchema = z.object({
  name: z.string().min(1).max(100), deviceId: z.string().uuid(), groupId: z.string().uuid().optional(),
  timeZone: z.string().default('*'), daysOfWeek: z.string().default('1,2,3,4,5,6,7'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'), endTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),
  active: z.boolean().default(true),
});

router.get('/', asyncHandler(async (req, res) => {
  const { deviceId } = req.query;
  const db = getDb();
  let sql = `SELECT ar.*, d.name as device_name, g.name as group_name FROM access_rules ar
    LEFT JOIN devices d ON ar.device_id = d.id LEFT JOIN person_groups g ON ar.group_id = g.id`;
  const params: any[] = [];
  if (deviceId) { sql += ` WHERE ar.device_id = ?`; params.push(deviceId); }
  sql += ` ORDER BY ar.name ASC`;
  const rules = db.prepare(sql).all(...params) as any[];
  res.json(rules.map(r => ({
    ...r, active: !!r.active,
    device: { id: r.device_id, name: r.device_name },
    group: r.group_name ? { name: r.group_name } : null,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rule = getDb().prepare('SELECT * FROM access_rules WHERE id = ?').get(req.params.id) as any;
  if (!rule) throw new AppError(404, 'Access rule not found');
  res.json({ ...rule, active: !!rule.active });
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = accessRuleSchema.parse(req.body);
  const id = crypto.randomUUID();
  getDb().prepare(`INSERT INTO access_rules (id, name, device_id, group_id, time_zone, days_of_week, start_time, end_time, active) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, data.name, data.deviceId, data.groupId || null, data.timeZone, data.daysOfWeek, data.startTime, data.endTime, data.active ? 1 : 0);
  res.status(201).json(getDb().prepare('SELECT * FROM access_rules WHERE id = ?').get(id));
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = accessRuleSchema.partial().parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM access_rules WHERE id = ?').get(req.params.id) as any;
  if (!existing) throw new AppError(404, 'Access rule not found');
  db.prepare(`UPDATE access_rules SET name=?, device_id=?, group_id=?, time_zone=?, days_of_week=?, start_time=?, end_time=?, active=?, updated_at=datetime('now') WHERE id=?`)
    .run(data.name ?? existing.name, data.deviceId ?? existing.device_id, data.groupId ?? existing.group_id,
      data.timeZone ?? existing.time_zone, data.daysOfWeek ?? existing.days_of_week, data.startTime ?? existing.start_time,
      data.endTime ?? existing.end_time, data.active !== undefined ? (data.active ? 1 : 0) : existing.active, req.params.id);
  res.json(db.prepare('SELECT * FROM access_rules WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  getDb().prepare('DELETE FROM access_rules WHERE id = ?').run(req.params.id);
  res.json({ message: 'Access rule deleted' });
}));

export { router as accessRuleRouter };
