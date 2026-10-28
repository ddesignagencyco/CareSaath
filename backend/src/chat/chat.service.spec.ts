import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923000000001' };
const caregiverUser: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923000000002' };
const stranger: AuthUser = { sub: 'u-stranger', role: 'CUSTOMER', phone: '+923000000003' };

function makeService() {
  const prisma = createPrismaMock();
  wireTransaction(prisma);
  const audit = createAuditMock();
  const realtime = { entityUpdated: vi.fn() };
  const service = new ChatService(prisma as never, audit as never, realtime as never);
  return { service, prisma, audit, realtime };
}

describe('ChatService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a party not on the booking', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(service.send(stranger, 'b-1', { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the customer send a message and notifies the caregiver', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      customerId: 'u-cust',
      caregiver: { userId: 'u-cg' },
    });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1', bookingId: 'b-1', senderId: 'u-cust', body: 'hi' });

    const result = await service.send(customer, 'b-1', { body: 'hi' });

    expect(result).toMatchObject({ id: 'msg-1' });
    expect(realtime.entityUpdated).toHaveBeenCalledWith(
      { users: ['u-cg'] },
      expect.objectContaining({ type: 'chat_message', action: 'created' }),
    );
  });

  it('lets the caregiver send a message and notifies the customer', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      customerId: 'u-cust',
      caregiver: { userId: 'u-cg' },
    });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-2', bookingId: 'b-1', senderId: 'u-cg', body: 'omw' });

    await service.send(caregiverUser, 'b-1', { body: 'omw' });

    expect(realtime.entityUpdated).toHaveBeenCalledWith(
      { users: ['u-cust'] },
      expect.anything(),
    );
  });

  it('paginates the thread', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', customerId: 'u-cust', caregiver: { userId: 'u-cg' } });
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.chatMessage.findMany.mockResolvedValue([{ id: 'msg-1' }]);
    await expect(service.list(customer, 'b-1', { page: 1, limit: 50 })).resolves.toEqual({
      items: [{ id: 'msg-1' }],
      page: 1,
      limit: 50,
      total: 1,
    });
  });

  it('marks only the other party\'s messages as read', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', customerId: 'u-cust', caregiver: { userId: 'u-cg' } });
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });
    await expect(service.markRead(customer, 'b-1')).resolves.toEqual({ updated: 3 });
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 'b-1', senderId: { not: 'u-cust' }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
