import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../database';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { encrypt, decrypt } from '../utils/encryption';
import { ControlIdService } from '../services/controlid.service';

const router = Router();
router.use(authenticate);

const deviceSchema = z.object({
  name: z.string().min(1).max(100), model: z.string().min(1).max(50), serialNumber: z.string().min(1).max(50),
  ipAddress: z.string().ip(), port: z.number().int().min(1).max(65535).default(443),
  login: z.string().min(1).default('admin'), password: z.string().min(1), locationId: z.string().uuid().optional(),
});

router.get('/', asyncHandler(async (_req, res) => {
  const db = getDb();
  const devices = db.prepare(`
    SELECT d.*, l.name as location_name, l.id as location_id_ref
    FROM devices d LEFT JOIN locations l ON d.location_id = l.id ORDER BY d.name ASC
  `).all() as any[];
  res.json(devices.map(({ password: _, ...d }) => ({
    ...d, location: d.location_name ? { id: d.location_id_ref, name: d.location_name } : null,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const device = db.prepare(`
    SELECT d.*, l.name as location_name FROM devices d LEFT JOIN locations l ON d.location_id = l.id WHERE d.id = ?
  `).get(req.params.id) as any;
  if (!device) throw new AppError(404, 'Device not found');
  const { password: _, ...sanitized } = device;
  sanitized.location = device.location_name ? { name: device.location_name } : null;
  res.json(sanitized);
}));

router.post('/', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = deviceSchema.parse(req.body);
  const id = crypto.randomUUID();
  getDb().prepare(`
    INSERT INTO devices (id, name, model, serial_number, ip_address, port, login, password, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.model, data.serialNumber, data.ipAddress, data.port, data.login, encrypt(data.password), data.locationId || null);
  const device = getDb().prepare('SELECT * FROM devices WHERE id = ?').get(id) as any;
  const { password: _, ...sanitized } = device;
  res.status(201).json(sanitized);
}));

router.put('/:id', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const data = deviceSchema.partial().parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any;
  if (!existing) throw new AppError(404, 'Device not found');
  db.prepare(`
    UPDATE devices SET name=?, model=?, serial_number=?, ip_address=?, port=?, login=?, password=?, location_id=?, updated_at=datetime('now') WHERE id=?
  `).run(
    data.name ?? existing.name, data.model ?? existing.model, data.serialNumber ?? existing.serial_number,
    data.ipAddress ?? existing.ip_address, data.port ?? existing.port, data.login ?? existing.login,
    data.password ? encrypt(data.password) : existing.password, data.locationId ?? existing.location_id, req.params.id
  );
  const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any;
  const { password: _, ...sanitized } = updated;
  res.json(sanitized);
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  getDb().prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  res.json({ message: 'Device deleted' });
}));

router.post('/:id/test-connection', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const device = getDb().prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any;
  if (!device) throw new AppError(404, 'Device not found');
  const api = new ControlIdService(device.ip_address, device.port, device.login, decrypt(device.password));
  const connected = await api.login();
  if (connected) {
    const info = await api.getDeviceInfo();
    await api.logout();
    res.json({ connected: true, info: info.data });
  } else {
    res.json({ connected: false, error: 'Could not connect to device' });
  }
}));

router.post('/:id/open-door', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const device = getDb().prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any;
  if (!device) throw new AppError(404, 'Device not found');
  const api = new ControlIdService(device.ip_address, device.port, device.login, decrypt(device.password));
  const connected = await api.login();
  if (!connected) throw new AppError(502, 'Could not connect to device');
  const result = await api.openDoor(req.body.doorId || 1);
  await api.logout();
  res.json({ success: result.success });
}));

router.post('/:id/sync-people', authorize('ADMIN', 'OPERATOR'), asyncHandler(async (req, res) => {
  const db = getDb();
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any;
  if (!device) throw new AppError(404, 'Device not found');
  const personDevices = db.prepare(`
    SELECT pd.*, p.name as person_name, p.registration, p.card_number
    FROM person_devices pd JOIN people p ON pd.person_id = p.id WHERE pd.device_id = ? AND pd.synced = 0
  `).all(req.params.id) as any[];
  const api = new ControlIdService(device.ip_address, device.port, device.login, decrypt(device.password));
  const connected = await api.login();
  if (!connected) throw new AppError(502, 'Could not connect to device');
  db.prepare("UPDATE devices SET status = 'SYNCING' WHERE id = ?").run(device.id);
  let synced = 0;
  for (const pd of personDevices) {
    const result = await api.addUser({ id: parseInt(pd.registration, 10), name: pd.person_name, registration: pd.registration });
    if (result.success) {
      if (pd.card_number) await api.addCard(parseInt(pd.registration, 10), parseInt(pd.card_number, 10));
      db.prepare("UPDATE person_devices SET synced = 1, synced_at = datetime('now') WHERE id = ?").run(pd.id);
      synced++;
    }
  }
  await api.logout();
  db.prepare("UPDATE devices SET status = 'ONLINE', last_sync_at = datetime('now') WHERE id = ?").run(device.id);
  res.json({ synced, total: personDevices.length });
}));

export { router as deviceRouter };
