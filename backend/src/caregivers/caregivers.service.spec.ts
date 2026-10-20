import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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
    service = new CaregiversService(prisma as never, createAuditMock() as never, storage as never);
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
    ).rejects.toBeInstanceOf(NotFoundException);
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
    expect(result).toMatchObject({ id: 'cg-1' });
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
    expect(storage.validateUpload).toHaveBeenCalled();
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
});
