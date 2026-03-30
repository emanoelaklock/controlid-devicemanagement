import { Router } from 'express';
import { query, count } from '../utils/db-helpers';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { deviceId, personId, event, startDate, endDate, page = '1', limit = '50' } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (deviceId) { where += ' AND al.device_id = ?'; params.push(deviceId); }
  if (personId) { where += ' AND al.person_id = ?'; params.push(personId); }
  if (event) { where += ' AND al.event = ?'; params.push(event); }
  if (startDate) { where += ' AND al.accessed_at >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND al.accessed_at <= ?'; params.push(endDate); }
  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 200);
  const total = count(`SELECT COUNT(*) as c FROM access_logs al ${where}`, params);
  const logs = query(`SELECT al.*, d.name as device_name, p.name as person_name, p.registration as person_registration
    FROM access_logs al LEFT JOIN devices d ON al.device_id = d.id LEFT JOIN people p ON al.person_id = p.id
    ${where} ORDER BY al.accessed_at DESC LIMIT ? OFFSET ?`, [...params, limitNum, (pageNum - 1) * limitNum]);
  res.json({
    data: logs.map((l: any) => ({ ...l, device: { id: l.device_id, name: l.device_name },
      person: l.person_name ? { id: l.person_id, name: l.person_name, registration: l.person_registration } : null })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
}));

export { router as accessLogRouter };
