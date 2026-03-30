import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, queryOne, run } from '../utils/db-helpers';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const ruleSchema = z.object({
  name: z.string().min(1).max(100), deviceId: z.string().uuid(), groupId: z.string().uuid().optional(),
  timeZone: z.string().default('*'), daysOfWeek: z.string().default('1,2,3,4,5,6,7'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'), endTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),
  active: z.boolean().default(true),
});

router.get('/', asyncHandler(async (req, res) => {
  const { deviceId } = req.query;
  let sql = `SELECT ar.*, d.name as device_name, g.name as group_name FROM access_rules ar LEFT JOIN devices d ON ar.device_id = d.id LEFT JOIN person_groups g ON ar.group_id = g.id`;
  const params: any[] = [];
  if (deviceId) { sql += ` WHERE ar.device_id = ?`; params.push(deviceId); }
  sql += ` ORDER BY ar.name ASC`;
  res.json(query(sql, params).map((r: any) => ({ ...r, active: !!r.active, device: { id: r.device_id, name: r.device_name }, group: r.group_name ? { name: r.group_name } : null })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rule = queryOne('SELECT * FROM access_rules WHERE id = ?', [req.params.id]);
  if (!rule) throw new AppError(404, 'Access rule not found');
  res.json({ ...rule, active: !!rule.active });
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = ruleSchema.parse(req.body);
  const id = crypto.randomUUID();
  run(`INSERT INTO access_rules (id,name,device_id,group_id,time_zone,days_of_week,start_time,end_time,active) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, data.name, data.deviceId, data.groupId || null, data.timeZone, data.daysOfWeek, data.startTime, data.endTime, data.active ? 1 : 0]);
  res.status(201).json(queryOne('SELECT * FROM access_rules WHERE id = ?', [id]));
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = ruleSchema.partial().parse(req.body);
  const e = queryOne('SELECT * FROM access_rules WHERE id = ?', [req.params.id]);
  if (!e) throw new AppError(404, 'Access rule not found');
  run(`UPDATE access_rules SET name=?,device_id=?,group_id=?,time_zone=?,days_of_week=?,start_time=?,end_time=?,active=?,updated_at=datetime('now') WHERE id=?`,
    [data.name??e.name, data.deviceId??e.device_id, data.groupId??e.group_id, data.timeZone??e.time_zone, data.daysOfWeek??e.days_of_week,
     data.startTime??e.start_time, data.endTime??e.end_time, data.active!==undefined?(data.active?1:0):e.active, req.params.id]);
  res.json(queryOne('SELECT * FROM access_rules WHERE id = ?', [req.params.id]));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  run('DELETE FROM access_rules WHERE id = ?', [req.params.id]);
  res.json({ message: 'Access rule deleted' });
}));

export { router as accessRuleRouter };
