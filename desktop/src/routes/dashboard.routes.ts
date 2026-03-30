import { Router } from 'express';
import { query, count } from '../utils/db-helpers';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/stats', asyncHandler(async (_req, res) => {
  res.json({
    devices: {
      total: count('SELECT COUNT(*) as c FROM devices'),
      online: count("SELECT COUNT(*) as c FROM devices WHERE status='ONLINE'"),
      offline: count("SELECT COUNT(*) as c FROM devices WHERE status='OFFLINE'"),
      error: count("SELECT COUNT(*) as c FROM devices WHERE status='ERROR'"),
    },
    people: { total: count('SELECT COUNT(*) as c FROM people'), active: count('SELECT COUNT(*) as c FROM people WHERE active=1') },
    locations: count('SELECT COUNT(*) as c FROM locations'),
    accessLogsLast24h: count("SELECT COUNT(*) as c FROM access_logs WHERE accessed_at >= datetime('now','-1 day')"),
  });
}));

router.get('/recent-activity', asyncHandler(async (_req, res) => {
  const recentAccess = query(`SELECT al.*, d.name as device_name, p.name as person_name FROM access_logs al
    LEFT JOIN devices d ON al.device_id = d.id LEFT JOIN people p ON al.person_id = p.id ORDER BY al.accessed_at DESC LIMIT 20`);
  const recentAudit = query(`SELECT al.*, u.name as user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 20`);
  res.json({
    recentAccess: recentAccess.map((a: any) => ({ ...a, device: { name: a.device_name }, person: a.person_name ? { name: a.person_name } : null })),
    recentAudit: recentAudit.map((a: any) => ({ ...a, user: a.user_name ? { name: a.user_name } : null })),
  });
}));

export { router as dashboardRouter };
