import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock } from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

describe('PatientsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: PatientsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PatientsService(prisma as never, createAuditMock() as never);
  });

  it('scopes lookups to the owning user', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(service.get(user, 'p-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', ownerUserId: 'u-1' },
    });
  });

  it('defaults relationship to SELF when not provided', async () => {
    prisma.patientProfile.create.mockResolvedValue({ id: 'p-1' });
    await service.create(user, { name: 'Baby' });
    expect(prisma.patientProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ relationship: 'SELF', name: 'Baby' }),
      }),
    );
  });

  it('refuses to delete a patient that has bookings', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p-1' });
    prisma.booking.count.mockResolvedValue(2);
    await expect(service.remove(user, 'p-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a patient with no bookings', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p-1' });
    prisma.booking.count.mockResolvedValue(0);
    prisma.patientProfile.delete.mockResolvedValue({ id: 'p-1' });
    await expect(service.remove(user, 'p-1')).resolves.toEqual({ ok: true });
  });
});
