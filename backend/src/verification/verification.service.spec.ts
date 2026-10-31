import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VerificationService } from './verification.module.js';
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

function pendingProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cg-1',
    userId: 'u-cg',
    cnic: null,
    user: { id: 'u-cg', phone: '+923001234569', fullName: 'Cg', status: 'ACTIVE' },
    verificationStatus: 'PENDING',
    documents: [{ id: 'doc-1', fileKey: 'k', mimeType: 'application/pdf' }],
    ...overrides,
  };
}

describe('VerificationService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: ReturnType<typeof createStorageMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let service: VerificationService;
  let caregivers: { recordStrike: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    caregivers = { recordStrike: vi.fn().mockResolvedValue(undefined) };
    prisma = createPrismaMock();
    storage = createStorageMock();
    wireTransaction(prisma);
    redis = createRedisMock();
    service = new VerificationService(
      prisma as never,
      createAuditMock() as never,
      storage as never,
      redis as never,
      createNotificationsMock() as never,
      caregivers as never,
    );
  });

  it('throws when the caregiver does not exist', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.approve(admin, 'cg-1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to approve an already approved caregiver', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(
      pendingProfile({ verificationStatus: 'APPROVED' }),
    );
    await expect(service.approve(admin, 'cg-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to approve without documents', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile({ documents: [] }));
    await expect(service.approve(admin, 'cg-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a pending caregiver with documents', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    prisma.caregiverProfile.update.mockResolvedValue({});
    prisma.credentialReview.create.mockResolvedValue({});
    await service.approve(admin, 'cg-1', { reason: 'PNC verified' });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: 'APPROVED' }),
      }),
    );
    expect(prisma.credentialReview.create).toHaveBeenCalled();
    expect(redis.deleteByPattern).toHaveBeenCalledWith('search:caregivers:*');
  });

  it('searches the caregiver queue by name, phone, or license number', async () => {
    prisma.caregiverProfile.count.mockResolvedValue(0);
    prisma.caregiverProfile.findMany.mockResolvedValue([]);
    await service.list({ q: 'Fatima', page: 1, limit: 20 } as never);
    expect(prisma.caregiverProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { user: { fullName: { contains: 'Fatima', mode: 'insensitive' } } },
            { user: { phone: { contains: 'Fatima' } } },
            { licenseNumber: { contains: 'Fatima', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('computes the badge tier on the admin list, not just the caregiver\'s own profile', async () => {
    prisma.caregiverProfile.count.mockResolvedValue(1);
    prisma.caregiverProfile.findMany.mockResolvedValue([
      pendingProfile({
        verificationStatus: 'APPROVED',
        experienceYears: 6,
        ratingAverage: '4.8',
        ratingCount: 25,
      }),
    ]);
    prisma.visit.count.mockResolvedValue(120);
    const result = await service.list({ page: 1, limit: 20 } as never);
    expect(result.items[0]).toMatchObject({ badge: 'PLATINUM' });
  });

  it('lifts a suspension on reactivate, resetting strikes but not approval dates', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(
      pendingProfile({ verificationStatus: 'SUSPENDED', userId: 'u-cg' }),
    );
    prisma.user.update.mockResolvedValue({});
    prisma.caregiverProfile.update.mockResolvedValue({});
    await service.reactivate(admin, 'cg-1');
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith({
      where: { id: 'cg-1' },
      data: { verificationStatus: 'APPROVED', strikeCount: 0 },
    });
    expect(redis.deleteByPattern).toHaveBeenCalledWith('search:caregivers:*');
  });

  it('does not touch strikes when reactivating a caregiver who was never suspended', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(
      pendingProfile({ verificationStatus: 'APPROVED', userId: 'u-cg' }),
    );
    prisma.user.update.mockResolvedValue({});
    await service.reactivate(admin, 'cg-1');
    expect(prisma.caregiverProfile.update).not.toHaveBeenCalled();
  });

  it('lists a caregiver\'s strike history, most recent first', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    prisma.caregiverStrike.findMany.mockResolvedValue([{ id: 's-1', reason: 'NO_SHOW' }]);
    const result = await service.listStrikes('cg-1');
    expect(result).toEqual([{ id: 's-1', reason: 'NO_SHOW' }]);
    expect(prisma.caregiverStrike.findMany).toHaveBeenCalledWith({
      where: { caregiverId: 'cg-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('refuses to reject an approved caregiver (use suspend instead)', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(
      pendingProfile({ verificationStatus: 'APPROVED' }),
    );
    await expect(service.reject(admin, 'cg-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suspends a caregiver', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    prisma.caregiverProfile.update.mockResolvedValue({});
    await service.suspend(admin, 'cg-1', { reason: 'complaint' });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: 'SUSPENDED' }),
      }),
    );
  });

  it('deactivates the caregiver user account', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    prisma.user.update.mockResolvedValue({});
    await service.deactivate(admin, 'cg-1', {});
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DEACTIVATED' } }),
    );
  });

  it('returns a presigned URL for an existing document', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    const result = await service.documentUrl('cg-1', 'doc-1');
    expect(storage.presignedGet).toHaveBeenCalledWith('k');
    expect(result).toMatchObject({ mimeType: 'application/pdf' });
  });

  it('throws for a missing document', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(pendingProfile());
    await expect(service.documentUrl('cg-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
