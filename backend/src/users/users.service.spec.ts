import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

function emailServiceMock() {
  return { sendEmail: vi.fn().mockResolvedValue(undefined) };
}

function authServiceMock() {
  return {
    requestPhoneChange: vi.fn().mockResolvedValue({ ttlSeconds: 300 }),
    verifyPhoneChange: vi.fn().mockResolvedValue({ phone: '+923009990001' }),
  };
}

function storageServiceMock() {
  return {
    presignedGet: vi.fn().mockResolvedValue('https://cdn.example.com/photo.jpg'),
    validateImageUpload: vi.fn(),
    put: vi.fn().mockResolvedValue({ fileKey: 'users/u-1/photo', mimeType: 'image/png', sizeBytes: 10 }),
  };
}

describe('UsersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let email: ReturnType<typeof emailServiceMock>;
  let auth: ReturnType<typeof authServiceMock>;
  let storage: ReturnType<typeof storageServiceMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = createAuditMock();
    email = emailServiceMock();
    auth = authServiceMock();
    storage = storageServiceMock();
    service = new UsersService(prisma as never, audit as never, auth as never, storage as never, email as never);
  });

  it('throws when the user record is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMe(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the profile including caregiver summary', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', phone: '+923001234567' });
    const result = await service.getMe(user);
    expect(result).toMatchObject({ id: 'u-1' });
  });

  it('updates and audits profile changes', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u-1', fullName: 'Ali' });
    await service.updateMe(user, { fullName: 'Ali' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.profile.updated' }),
    );
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('sends a welcome email the first time an email is added', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: null });
    prisma.user.update.mockResolvedValue({
      id: 'u-1',
      fullName: 'Ali',
      email: 'ali@example.com',
      role: 'CUSTOMER',
    });
    await service.updateMe(user, { email: 'ali@example.com' });
    expect(email.sendEmail).toHaveBeenCalledWith(
      'ali@example.com',
      'Welcome to CareSaath',
      expect.stringContaining('Welcome, Ali'),
    );
  });

  it('maps a duplicate email to a 409 instead of a raw Prisma error', async () => {
    prisma.user.update.mockRejectedValue({ code: 'P2002' });
    await expect(service.updateMe(user, { email: 'taken@example.com' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not re-send the welcome email when the address is already on file', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'ali@example.com' });
    prisma.user.update.mockResolvedValue({
      id: 'u-1',
      fullName: 'Ali',
      email: 'ali@example.com',
      role: 'CUSTOMER',
    });
    await service.updateMe(user, { email: 'ali@example.com' });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('delegates a phone-change request to AuthService', async () => {
    await service.requestPhoneChange(user, { newPhone: '+923009990001' });
    expect(auth.requestPhoneChange).toHaveBeenCalledWith('u-1', '+923009990001');
  });

  it('verifies a phone change and audits it', async () => {
    const result = await service.verifyPhoneChange(user, { code: '123456' });
    expect(auth.verifyPhoneChange).toHaveBeenCalledWith('u-1', '123456');
    expect(result).toEqual({ phone: '+923009990001' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.phone_changed' }),
    );
  });

  it('deactivates my own account and audits it', async () => {
    prisma.user.update.mockResolvedValue({});
    await expect(service.deactivateSelf(user)).resolves.toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { status: 'DEACTIVATED' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.self_deactivated' }),
    );
  });

  it('refuses to delete an emergency contact owned by another user', async () => {
    prisma.emergencyContact.findFirst.mockResolvedValue(null);
    await expect(service.removeEmergencyContact(user, 'ec-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an owned emergency contact', async () => {
    prisma.emergencyContact.findFirst.mockResolvedValue({ id: 'ec-1' });
    prisma.emergencyContact.delete.mockResolvedValue({ id: 'ec-1' });
    await expect(service.removeEmergencyContact(user, 'ec-1')).resolves.toEqual({ ok: true });
  });

  describe('profile photos', () => {
    it('returns photoUrl in getMe when photoKey is present', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        phone: '+923001234567',
        photoKey: 'users/u-1/photo',
      });
      const res = await service.getMe(user);
      expect(res.photoUrl).toBe('https://cdn.example.com/photo.jpg');
      expect(storage.presignedGet).toHaveBeenCalledWith('users/u-1/photo');
    });

    it('throws BadRequestException when no file is provided', async () => {
      await expect(service.uploadPhoto(user, undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uploads a photo, syncing user and caregiver profile, and records an audit log', async () => {
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const file = {
        originalname: 'portrait.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-data'),
      };
      const res = await service.uploadPhoto(user, file);
      expect(storage.validateImageUpload).toHaveBeenCalledWith('image/png', file.buffer.length);
      expect(storage.put).toHaveBeenCalledWith(
        'users/u-1/photo',
        'portrait.png',
        file.buffer,
        'image/png',
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.photo.updated', entityId: 'u-1' }),
      );
      expect(res).toEqual({
        photoKey: 'users/u-1/photo',
        photoUrl: 'https://cdn.example.com/photo.jpg',
      });
    });

    it('removes a photo and records an audit log', async () => {
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const res = await service.removePhoto(user);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.photo.removed', entityId: 'u-1' }),
      );
      expect(res).toEqual({ ok: true });
    });

    it('throws NotFoundException when retrieving photo url for user without photo', async () => {
      prisma.user.findUnique.mockResolvedValue({ photoKey: null, caregiverProfile: null });
      await expect(service.photoUrl(user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns photo url when photo key exists on user or caregiverProfile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        photoKey: null,
        caregiverProfile: { photoKey: 'caregivers/cg-1/portrait' },
      });
      const res = await service.photoUrl(user);
      expect(res).toEqual({ url: 'https://cdn.example.com/photo.jpg' });
      expect(storage.presignedGet).toHaveBeenCalledWith('caregivers/cg-1/portrait');
    });

    it('returns public photo url or null', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        photoKey: 'users/u-2/photo',
        caregiverProfile: null,
      });
      expect(await service.publicPhotoUrl('u-2')).toBe('https://cdn.example.com/photo.jpg');

      prisma.user.findUnique.mockResolvedValueOnce(null);
      expect(await service.publicPhotoUrl('u-unknown')).toBeNull();
    });
  });
});
