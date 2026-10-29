import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminCustomersService } from './customers.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

const admin: AuthUser = { sub: 'admin-1', role: 'ADMIN', phone: '+923000000000' };

describe('AdminCustomersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AdminCustomersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new AdminCustomersService(prisma as never, createAuditMock() as never);
  });

  it('searches customers by name, phone, or email', async () => {
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
    await service.list({ q: 'ayesha', page: 1, limit: 20 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: 'CUSTOMER',
          OR: [
            { fullName: { contains: 'ayesha', mode: 'insensitive' } },
            { phone: { contains: 'ayesha' } },
            { email: { contains: 'ayesha', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('404s when a customer does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.get('u-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a customer with their booking summary', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u-1', fullName: 'Ayesha Khan' });
    prisma.booking.count.mockResolvedValue(3);
    prisma.booking.findMany.mockResolvedValue([{ id: 'b-1' }]);
    const result = await service.get('u-1');
    expect(result).toMatchObject({ id: 'u-1', bookingsTotal: 3, recentBookings: [{ id: 'b-1' }] });
  });

  it('deactivates a customer and audits it', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    prisma.user.update.mockResolvedValue({});
    const audit = createAuditMock();
    service = new AdminCustomersService(prisma as never, audit as never);
    await service.deactivate(admin, 'u-1', { reason: 'requested' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { status: 'DEACTIVATED' } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'customer.deactivated', metadata: { reason: 'requested' } }),
    );
  });

  it('reactivates a deactivated customer', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    prisma.user.update.mockResolvedValue({});
    await service.reactivate(admin, 'u-1');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { status: 'ACTIVE' } });
  });
});
