import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock } from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };
const dto = {
  addressLine: '12 Main St',
  city: 'Lahore',
  latitude: '31.5204',
  longitude: '74.3587',
};

describe('AddressesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AddressesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AddressesService(prisma as never, createAuditMock() as never);
  });

  it('scopes lookups to the owning user', async () => {
    prisma.address.findFirst.mockResolvedValue(null);
    await expect(service.get(user, 'a-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.address.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-1', userId: 'u-1' },
    });
  });

  it('creates an address bound to the user', async () => {
    prisma.address.create.mockResolvedValue({ id: 'a-1' });
    await service.create(user, dto);
    expect(prisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u-1', city: 'Lahore' }),
      }),
    );
  });

  it('refuses to delete an address referenced by bookings', async () => {
    prisma.address.findFirst.mockResolvedValue({ id: 'a-1' });
    prisma.booking.count.mockResolvedValue(1);
    await expect(service.remove(user, 'a-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
