import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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

describe('UsersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let email: ReturnType<typeof emailServiceMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = createAuditMock();
    email = emailServiceMock();
    service = new UsersService(prisma as never, audit as never, email as never);
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
      expect.stringContaining('Welcome to CareSaath'),
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
});
