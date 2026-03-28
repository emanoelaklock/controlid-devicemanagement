import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { encrypt, decrypt } from '../utils/encryption';
import { ControlIdService } from '../services/controlid.service';
import { createAuditLog } from '../services/audit.service';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

const deviceSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1).max(50),
  serialNumber: z.string().min(1).max(50),
  ipAddress: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(443),
  login: z.string().min(1).default('admin'),
  password: z.string().min(1),
  locationId: z.string().uuid().optional(),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const devices = await prisma.device.findMany({
      include: { location: true },
      orderBy: { name: 'asc' },
    });

    const sanitized = devices.map(({ password: _, ...device }) => device);
    res.json(sanitized);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: { location: true, accessRules: true },
    });
    if (!device) throw new AppError(404, 'Device not found');

    const { password: _, ...sanitized } = device;
    res.json(sanitized);
  })
);

router.post(
  '/',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const data = deviceSchema.parse(req.body);

    const device = await prisma.device.create({
      data: {
        ...data,
        password: encrypt(data.password),
      },
      include: { location: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      deviceId: device.id,
      action: 'CREATE',
      entity: 'device',
      entityId: device.id,
      details: `Device "${device.name}" created`,
    });

    const { password: _, ...sanitized } = device;
    res.status(201).json(sanitized);
  })
);

router.put(
  '/:id',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const data = deviceSchema.partial().parse(req.body);

    const updateData: Record<string, unknown> = { ...data };
    if (data.password) {
      updateData.password = encrypt(data.password);
    }

    const device = await prisma.device.update({
      where: { id: req.params.id },
      data: updateData,
      include: { location: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      deviceId: device.id,
      action: 'UPDATE',
      entity: 'device',
      entityId: device.id,
    });

    const { password: _, ...sanitized } = device;
    res.json(sanitized);
  })
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const device = await prisma.device.delete({ where: { id: req.params.id } });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'device',
      entityId: device.id,
      details: `Device "${device.name}" deleted`,
    });

    res.json({ message: 'Device deleted' });
  })
);

router.post(
  '/:id/test-connection',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) throw new AppError(404, 'Device not found');

    const api = new ControlIdService(
      device.ipAddress,
      device.port,
      device.login,
      decrypt(device.password)
    );

    const connected = await api.login_();
    if (connected) {
      const info = await api.getDeviceInfo();
      await api.logout();

      if (info.data?.firmware) {
        await prisma.device.update({
          where: { id: device.id },
          data: {
            firmwareVersion: info.data.firmware as string,
            status: 'ONLINE',
            lastHeartbeat: new Date(),
          },
        });
      }

      res.json({ connected: true, info: info.data });
    } else {
      res.json({ connected: false, error: 'Could not connect to device' });
    }
  })
);

router.post(
  '/:id/open-door',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) throw new AppError(404, 'Device not found');

    const api = new ControlIdService(
      device.ipAddress,
      device.port,
      device.login,
      decrypt(device.password)
    );

    const connected = await api.login_();
    if (!connected) throw new AppError(502, 'Could not connect to device');

    const result = await api.openDoor(req.body.doorId || 1);
    await api.logout();

    await createAuditLog({
      userId: req.user!.userId,
      deviceId: device.id,
      action: 'OPEN_DOOR',
      entity: 'device',
      entityId: device.id,
      details: `Remote door open by ${req.user!.email}`,
    });

    res.json({ success: result.success });
  })
);

router.post(
  '/:id/sync-people',
  authorize('ADMIN', 'OPERATOR'),
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) throw new AppError(404, 'Device not found');

    const personDevices = await prisma.personDevice.findMany({
      where: { deviceId: device.id, synced: false },
      include: { person: true },
    });

    const api = new ControlIdService(
      device.ipAddress,
      device.port,
      device.login,
      decrypt(device.password)
    );

    const connected = await api.login_();
    if (!connected) throw new AppError(502, 'Could not connect to device');

    await prisma.device.update({
      where: { id: device.id },
      data: { status: 'SYNCING' },
    });

    let synced = 0;
    for (const pd of personDevices) {
      const result = await api.addUser({
        id: parseInt(pd.person.registration, 10),
        name: pd.person.name,
        registration: pd.person.registration,
      });

      if (result.success) {
        if (pd.person.cardNumber) {
          await api.addCard(
            parseInt(pd.person.registration, 10),
            parseInt(pd.person.cardNumber, 10)
          );
        }

        await prisma.personDevice.update({
          where: { id: pd.id },
          data: { synced: true, syncedAt: new Date() },
        });
        synced++;
      }
    }

    await api.logout();
    await prisma.device.update({
      where: { id: device.id },
      data: { status: 'ONLINE', lastSyncAt: new Date() },
    });

    await createAuditLog({
      userId: req.user!.userId,
      deviceId: device.id,
      action: 'SYNC',
      entity: 'device',
      entityId: device.id,
      details: `Synced ${synced}/${personDevices.length} people`,
    });

    res.json({ synced, total: personDevices.length });
  })
);

export { router as deviceRouter };
