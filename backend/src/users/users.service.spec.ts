import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

describe('UsersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = createAuditMock();
    service = new UsersService(prisma as never, audit as never);
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
