import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CaregiversService } from './caregivers.module.js';
import { deriveKey, encryptField } from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
  createStorageMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

describe('CaregiversService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: ReturnType<typeof createStorageMock>;
  let service: CaregiversService;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = createStorageMock();
    wireTransaction(prisma);
    const redis = { client: { get: vi.fn().mockResolvedValue(null), set: vi.fn() } };
    const config = { getNumber: vi.fn().mockResolvedValue(30) };
    service = new CaregiversService(
      prisma as never,
      createAuditMock() as never,
      storage as never,
      redis as never,
      config as never,
      { issueTokens: async () => ({ accessToken: 'a', refreshToken: 'r' }) } as never,
    );
  });

  it('rejects registering twice', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    await expect(
      service.register(user, {
        cnic: '1234567890123',
        licenseNumber: 'PNC-1',
        licenseBody: 'PNC' as never,
        specialty: 'NURSING' as never,
        serviceCities: ['Lahore'],
        ratePerVisit: 5000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a configured commission rate for the specialty', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    prisma.commissionRate.findUnique.mockResolvedValue(null);
    await expect(
      service.register(user, {
        cnic: '1234567890123',
        licenseNumber: 'PNC-1',
        licenseBody: 'PNC' as never,
        specialty: 'NURSING' as never,
        serviceCities: ['Lahore'],
        ratePerVisit: 5000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a profile and promotes the user to CAREGIVER', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    prisma.commissionRate.findUnique.mockResolvedValue({ id: 'comm-1' });
    prisma.caregiverProfile.create.mockResolvedValue({ id: 'cg-1' });
    const result = await service.register(user, {
      cnic: '1234567890123',
      licenseNumber: 'PNC-1',
      licenseBody: 'PNC' as never,
      specialty: 'NURSING' as never,
      serviceCities: ['Lahore'],
      ratePerVisit: 5000,
    });
    expect(result).toMatchObject({ id: 'cg-1', accessToken: 'a', refreshToken: 'r' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'CAREGIVER' } }),
    );
  });

  it('restricts public search to APPROVED + ACTIVE', async () => {
    prisma.caregiverProfile.count.mockResolvedValue(0);
    prisma.caregiverProfile.findMany.mockResolvedValue([]);
    await service.search({ page: 1, limit: 20, specialty: 'NURSING' as never });
    const arg = prisma.caregiverProfile.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      verificationStatus: 'APPROVED',
      user: { status: 'ACTIVE' },
      specialty: 'NURSING',
    });
  });

  it('filters search by city using the JSON array path', async () => {
    prisma.caregiverProfile.count.mockResolvedValue(0);
    prisma.caregiverProfile.findMany.mockResolvedValue([]);
    await service.search({ page: 1, limit: 20, city: 'Lahore' });
    const arg = prisma.caregiverProfile.findMany.mock.calls[0][0];
    expect(arg.where.serviceArea).toEqual({
      path: ['cities'],
      array_contains: ['Lahore'],
    });
  });

  it('rejects public profile for non-approved caregivers', async () => {
    prisma.caregiverProfile.findFirst.mockResolvedValue(null);
    await expect(service.getPublic('cg-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates and stores an uploaded photo', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    storage.put.mockResolvedValue({
      fileKey: 'caregivers/cg-1/photo/x.png',
      mimeType: 'image/png',
      sizeBytes: 10,
    });
    prisma.caregiverProfile.update.mockResolvedValue({});
    const result = await service.uploadPhoto(user, {
      originalname: 'x.png',
      mimetype: 'image/png',
      buffer: Buffer.from('x'),
    });
    expect(storage.validateImageUpload).toHaveBeenCalled();
    expect(result).toMatchObject({ photoKey: 'caregivers/cg-1/photo/x.png' });
  });

  it('throws when no photo is available for a URL', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1', photoKey: null });
    await expect(service.photoUrl(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores the CNIC encrypted at rest (not plaintext)', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    prisma.commissionRate.findUnique.mockResolvedValue({ id: 'comm-1' });
    prisma.caregiverProfile.create.mockResolvedValue({ id: 'cg-1' });
    await service.register(user, {
      cnic: '35201-1234567-1',
      licenseNumber: 'PNC-1',
      licenseBody: 'PNC' as never,
      specialty: 'NURSING' as never,
      serviceCities: ['Lahore'],
      ratePerVisit: 5000,
    });
    const data = prisma.caregiverProfile.create.mock.calls[0][0].data;
    expect(data.cnic).not.toBe('35201-1234567-1');
    expect(data.cnic).toContain(':');
  });

  it('masks the CNIC when the caregiver reads their own profile', async () => {
    const encrypted = encryptField('35201-1234567-1', deriveKey('CNIC_ENCRYPTION_KEY', 'caresaath-dev-cnic-key'));
    prisma.caregiverProfile.findUnique.mockResolvedValue({
      id: 'cg-1',
      cnic: encrypted,
      documents: [],
      credentialReviews: [],
    });
    const result = (await service.getMine(user)) as { cnic: string };
    expect(result.cnic).toBe('***********67-1');
  });

  it('deletes an unverified caregiver\'s wrongly-uploaded document', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1', verificationStatus: 'PENDING' });
    prisma.caregiverDocument.findFirst.mockResolvedValue({ id: 'doc-1', type: 'LICENSE' });
    prisma.caregiverDocument.delete.mockResolvedValue({});
    await expect(service.deleteDocument(user, 'doc-1')).resolves.toEqual({ ok: true });
    expect(prisma.caregiverDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('refuses to delete a document once the profile is verified', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1', verificationStatus: 'APPROVED' });
    prisma.caregiverDocument.findFirst.mockResolvedValue({ id: 'doc-1', type: 'LICENSE' });
    await expect(service.deleteDocument(user, 'doc-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.caregiverDocument.delete).not.toHaveBeenCalled();
  });

  it('clears the live GPS fix to stop sharing location entirely', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.caregiverProfile.update.mockResolvedValue({});
    await expect(service.stopSharingLocation(user)).resolves.toEqual({ ok: true });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith({
      where: { id: 'cg-1' },
      data: { currentLat: null, currentLng: null, locationUpdatedAt: null },
    });
  });

  it('lists the caller\'s own strikes, most recent first', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.caregiverStrike.findMany.mockResolvedValue([{ id: 's-1', reason: 'LATE_ARRIVAL' }]);
    const result = await service.listOwnStrikes(user);
    expect(result).toEqual([{ id: 's-1', reason: 'LATE_ARRIVAL' }]);
    expect(prisma.caregiverStrike.findMany).toHaveBeenCalledWith({
      where: { caregiverId: 'cg-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('404s listing strikes for a user with no caregiver profile', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.listOwnStrikes(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('pricing bracket', () => {
    it('register: defaults the bracket to ratePerVisit when no bracket is given', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue(null);
      prisma.commissionRate.findUnique.mockResolvedValue({ id: 'comm-1' });
      prisma.caregiverProfile.create.mockResolvedValue({ id: 'cg-1' });
      await service.register(user, {
        cnic: '1234567890123',
        licenseNumber: 'PNC-1',
        licenseBody: 'PNC' as never,
        specialty: 'NURSING' as never,
        serviceCities: ['Lahore'],
        ratePerVisit: 50000,
      });
      const data = prisma.caregiverProfile.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ minRatePerVisit: 50000, maxRatePerVisit: 50000 });
    });

    it('register: rejects a rate outside the given bracket', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue(null);
      prisma.commissionRate.findUnique.mockResolvedValue({ id: 'comm-1' });
      await expect(
        service.register(user, {
          cnic: '1234567890123',
          licenseNumber: 'PNC-1',
          licenseBody: 'PNC' as never,
          specialty: 'NURSING' as never,
          serviceCities: ['Lahore'],
          ratePerVisit: 40000,
          minRatePerVisit: 50000,
          maxRatePerVisit: 80000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.caregiverProfile.create).not.toHaveBeenCalled();
    });

    it('register: rejects an inverted bracket', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue(null);
      prisma.commissionRate.findUnique.mockResolvedValue({ id: 'comm-1' });
      await expect(
        service.register(user, {
          cnic: '1234567890123',
          licenseNumber: 'PNC-1',
          licenseBody: 'PNC' as never,
          specialty: 'NURSING' as never,
          serviceCities: ['Lahore'],
          ratePerVisit: 50000,
          minRatePerVisit: 80000,
          maxRatePerVisit: 50000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updateProfile: allows moving the rate within the existing bracket', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue({
        id: 'cg-1',
        specialty: 'NURSING',
        ratePerVisit: 50000,
        minRatePerVisit: 40000,
        maxRatePerVisit: 60000,
        commissionRateId: 'comm-1',
      });
      prisma.caregiverProfile.update.mockResolvedValue({ id: 'cg-1', ratePerVisit: 55000 });
      const result = await service.updateProfile(user, { ratePerVisit: 55000 });
      expect(result).toMatchObject({ ratePerVisit: 55000 });
    });

    it('updateProfile: rejects moving the rate outside the existing bracket', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue({
        id: 'cg-1',
        specialty: 'NURSING',
        ratePerVisit: 50000,
        minRatePerVisit: 40000,
        maxRatePerVisit: 60000,
        commissionRateId: 'comm-1',
      });
      await expect(service.updateProfile(user, { ratePerVisit: 70000 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.caregiverProfile.update).not.toHaveBeenCalled();
    });

    it('updateProfile: can widen the bracket and move the rate in the same call', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue({
        id: 'cg-1',
        specialty: 'NURSING',
        ratePerVisit: 50000,
        minRatePerVisit: 40000,
        maxRatePerVisit: 60000,
        commissionRateId: 'comm-1',
      });
      prisma.caregiverProfile.update.mockResolvedValue({ id: 'cg-1', ratePerVisit: 75000 });
      await service.updateProfile(user, { ratePerVisit: 75000, maxRatePerVisit: 80000 });
      expect(prisma.caregiverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ratePerVisit: 75000, maxRatePerVisit: 80000 }),
        }),
      );
    });

    it('updateProfile: leaves an untouched bracket/rate alone (no validation noise)', async () => {
      prisma.caregiverProfile.findUnique.mockResolvedValue({
        id: 'cg-1',
        specialty: 'NURSING',
        ratePerVisit: 50000,
        minRatePerVisit: 40000,
        maxRatePerVisit: 60000,
        commissionRateId: 'comm-1',
      });
      prisma.caregiverProfile.update.mockResolvedValue({ id: 'cg-1', bio: 'Updated bio' });
      await expect(service.updateProfile(user, { bio: 'Updated bio' })).resolves.toMatchObject({
        bio: 'Updated bio',
      });
    });
  });
});
