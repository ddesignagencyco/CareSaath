import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VerificationService } from './verification.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
  createStorageMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'admin-1', role: 'ADMIN', phone: '+923001234567' };

function pendingProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cg-1',
    userId: 'u-cg',
    verificationStatus: 'PENDING',
    documents: [{ id: 'doc-1', fileKey: 'k', mimeType: 'application/pdf' }],
    ...overrides,
  };
}

describe('VerificationService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: ReturnType<typeof createStorageMock>;
  let service: VerificationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = createStorageMock();
    wireTransaction(prisma);
    service = new VerificationService(prisma as never, createAuditMock() as never, storage as never);
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
