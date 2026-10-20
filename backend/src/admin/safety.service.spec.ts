import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminSafetyService } from './safety.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' };

describe('AdminSafetyService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let service: AdminSafetyService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    notifications = createNotificationsMock();
    service = new AdminSafetyService(
      prisma as never,
      createAuditMock() as never,
      notifications as never,
    );
  });

  it('404s when updating a missing incident', async () => {
    prisma.safetyIncident.findUnique.mockResolvedValue(null);
    await expect(service.update(admin, 'i-1', { status: 'RESOLVED' as never })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires at least one change', async () => {
    prisma.safetyIncident.findUnique.mockResolvedValue({ id: 'i-1', status: 'OPEN', priority: 'LOW' });
    await expect(service.update(admin, 'i-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates incident status and appends an audit event', async () => {
    prisma.safetyIncident.findUnique.mockResolvedValue({
      id: 'i-1',
      status: 'OPEN',
      priority: 'HIGH',
      assignedAdminId: null,
      reportedById: 'u-cust',
    });
    prisma.safetyIncident.update.mockResolvedValue({ id: 'i-1', status: 'IN_REVIEW' });
    prisma.incidentEvent.create.mockResolvedValue({ id: 'ev-1' });

    const result = await service.update(admin, 'i-1', { status: 'IN_REVIEW' as never, note: 'triaging' });

    expect(result).toMatchObject({ status: 'IN_REVIEW' });
    expect(prisma.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ incidentId: 'i-1', actorId: 'u-admin', note: 'triaging' }),
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cust', event: 'safety_incident.updated' }),
    );
  });

  it('assigns the incident to the acting admin on first update', async () => {
    prisma.safetyIncident.findUnique.mockResolvedValue({
      id: 'i-1',
      status: 'OPEN',
      priority: 'LOW',
      assignedAdminId: null,
      reportedById: 'u-cust',
    });
    prisma.safetyIncident.update.mockResolvedValue({ id: 'i-1', status: 'IN_REVIEW' });
    prisma.incidentEvent.create.mockResolvedValue({ id: 'ev-1' });

    await service.update(admin, 'i-1', { priority: 'CRITICAL' as never });

    expect(prisma.safetyIncident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 'CRITICAL', assignedAdminId: 'u-admin' }),
      }),
    );
  });
});
