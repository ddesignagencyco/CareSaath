import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from './availability.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CAREGIVER', phone: '+923001234567' };

describe('AvailabilityService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AvailabilityService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new AvailabilityService(prisma as never, createAuditMock() as never);
  });

  it('throws when the user has no caregiver profile', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.get(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a rule whose start is not before its end', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    await expect(
      service.setRules(user, { rules: [{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate (day, start) windows', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    await expect(
      service.setRules(user, {
        rules: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the weekly rule set in a transaction', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.availabilityRule.findMany.mockResolvedValue([]);
    prisma.availabilityBlock.findMany.mockResolvedValue([]);
    await service.setRules(user, {
      rules: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
    });
    expect(prisma.availabilityRule.deleteMany).toHaveBeenCalledWith({
      where: { caregiverId: 'cg-1' },
    });
    expect(prisma.availabilityRule.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ caregiverId: 'cg-1' })] }),
    );
  });

  it('rejects a block whose end is before its start', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    await expect(
      service.addBlock(user, { startDate: '2026-02-10', endDate: '2026-02-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete a block not owned by the caregiver', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.availabilityBlock.findFirst.mockResolvedValue(null);
    await expect(service.removeBlock(user, 'blk-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
