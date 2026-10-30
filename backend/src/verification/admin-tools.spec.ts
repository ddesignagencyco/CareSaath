import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ManageStrikesDto, SetBadgeDto, VerificationService } from './verification.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  createRedisMock,
  createStorageMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'admin-1', role: 'ADMIN', phone: '+923001234567' };

function makeService(profile: Record<string, unknown> = {}) {
  const prisma = createPrismaMock();
  wireTransaction(prisma);
  const audit = createAuditMock();
  const caregivers = { recordStrike: vi.fn().mockResolvedValue(undefined) };
  const full = {
    id: 'cg-1',
    userId: 'u-cg',
    cnic: 'x',
    experienceYears: 0,
    ratingAverage: 0,
    ratingCount: 0,
    strikeCount: 2,
    badgeOverride: null,
    verificationStatus: 'APPROVED',
    user: { id: 'u-cg', phone: '+92', fullName: 'Cg', status: 'ACTIVE' },
    documents: [],
    ...profile,
  };
  prisma.caregiverProfile.findUnique.mockResolvedValue(full);
  prisma.visit.count.mockResolvedValue(0);
  const service = new VerificationService(
    prisma as never,
    audit as never,
    createStorageMock() as never,
    createRedisMock() as never,
    createNotificationsMock() as never,
    caregivers as never,
  );
  return { service, prisma, audit, caregivers };
}

describe('Admin badge override', () => {
  it('stores the override and serves it as the effective badge', async () => {
    const { service, prisma, audit } = makeService();
    prisma.caregiverProfile.findUnique
      .mockResolvedValueOnce({ id: 'cg-1', badgeOverride: null, documents: [] })
      .mockResolvedValue({
        id: 'cg-1', userId: 'u-cg', cnic: 'x', experienceYears: 0, ratingAverage: 0, ratingCount: 0,
        badgeOverride: 'PLATINUM', verificationStatus: 'APPROVED',
        user: { id: 'u-cg', status: 'ACTIVE' }, documents: [],
      });
    const record = await service.setBadge(admin, 'cg-1', { badge: 'PLATINUM' as never });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith({ where: { id: 'cg-1' }, data: { badgeOverride: 'PLATINUM' } });
    expect(record).toMatchObject({ badge: 'PLATINUM', badgeOverride: 'PLATINUM', computedBadge: 'BRONZE' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'caregiver.badge.overridden' }));
  });

  it('accepts null (back to auto) but rejects an unknown tier', async () => {
    expect(await validate(plainToInstance(SetBadgeDto, { badge: null }))).toHaveLength(0);
    expect(await validate(plainToInstance(SetBadgeDto, { badge: 'DIAMOND' }))).not.toHaveLength(0);
  });
});

describe('Admin strikes', () => {
  it('adds a manual strike through the normal strike path (threshold still applies)', async () => {
    const { service, caregivers } = makeService();
    await service.manageStrikes(admin, 'cg-1', { op: 'add', reason: 'NO_SHOW' as never, note: 'phoned in' });
    expect(caregivers.recordStrike).toHaveBeenCalledWith('cg-1', 'NO_SHOW', undefined, {
      note: 'phoned in',
      actorId: 'admin-1',
    });
  });

  it('reset clears strike rows, zeroes the count and audits it', async () => {
    const { service, prisma, audit } = makeService();
    prisma.caregiverStrike.deleteMany.mockResolvedValue({ count: 2 });
    await service.manageStrikes(admin, 'cg-1', { op: 'reset' });
    expect(prisma.caregiverStrike.deleteMany).toHaveBeenCalledWith({ where: { caregiverId: 'cg-1' } });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith({ where: { id: 'cg-1' }, data: { strikeCount: 0 } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'caregiver.strikes.reset', metadata: { previousStrikeCount: 2, strikesCleared: 2 } }),
    );
  });

  it('requires a reason for op=add only', async () => {
    expect(await validate(plainToInstance(ManageStrikesDto, { op: 'reset' }))).toHaveLength(0);
    expect(await validate(plainToInstance(ManageStrikesDto, { op: 'add' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ManageStrikesDto, { op: 'add', reason: 'LATE_ARRIVAL' }))).toHaveLength(0);
  });
});
