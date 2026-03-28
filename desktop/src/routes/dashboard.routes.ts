import { Router } from 'express';
import { getDb } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/stats', asyncHandler(async (_req, res) => {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as any).count;

  res.json({
    devices: {
      total: count('SELECT COUNT(*) as count FROM devices'),
      online: count("SELECT COUNT(*) as count FROM devices WHERE status = 'ONLINE'"),
      offline: count("SELECT COUNT(*) as count FROM devices WHERE status = 'OFFLINE'"),
      error: count("SELECT COUNT(*) as count FROM devices WHERE status = 'ERROR'"),
    },
    people: {
      total: count('SELECT COUNT(*) as count FROM people'),
      active: count('SELECT COUNT(*) as count FROM people WHERE active = 1'),
    },
    locations: count('SELECT COUNT(*) as count FROM locations'),
    accessLogsLast24h: count("SELECT COUNT(*) as count FROM access_logs WHERE accessed_at >= datetime('now', '-1 day')"),
  });
}));

router.get('/recent-activity', asyncHandler(async (_req, res) => {
  const db = getDb();
  const recentAccess = db.prepare(`
    SELECT al.*, d.name as device_name, p.name as person_name
    FROM access_logs al LEFT JOIN devices d ON al.device_id = d.id LEFT JOIN people p ON al.person_id = p.id
    ORDER BY al.accessed_at DESC LIMIT 20
  `).all() as any[];
  const recentAudit = db.prepare(`
    SELECT al.*, u.name as user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 20
  `).all() as any[];

  res.json({
    recentAccess: recentAccess.map(a => ({ ...a, device: { name: a.device_name }, person: a.person_name ? { name: a.person_name } : null })),
    recentAudit: recentAudit.map(a => ({ ...a, user: a.user_name ? { name: a.user_name } : null })),
  });
}));

export { router as dashboardRouter };
