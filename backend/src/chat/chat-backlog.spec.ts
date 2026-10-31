import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createConfigMock, createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923000000001' };
const caregiverUser: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923000000002' };
const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000009' };

function makeService() {
  const prisma = createPrismaMock();
  wireTransaction(prisma);
  const realtime = { entityUpdated: vi.fn(), emit: vi.fn() };
  const service = new ChatService(
    prisma as never,
    createAuditMock() as never,
    undefined,
    undefined,
    realtime as never,
    createConfigMock({ 'chat.deleteGraceMinutes': 60 }) as never,
  );
  return { service, prisma, realtime };
}

const booking = (status = 'CONFIRMED') => ({ id: 'b-1', status, customerId: 'u-cust', caregiver: { userId: 'u-cg' } });

describe('ChatService — booking scope', () => {
  it.each(['REQUESTED', 'DECLINED', 'CANCELLED'])('403s a party on a %s booking (read and write)', async (status) => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking(status));
    await expect(service.list(customer, 'b-1', { page: 1, limit: 50 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.send(customer, 'b-1', { body: 'hi' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.react(customer, 'b-1', 'm-1', { emoji: '👍' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.initUpload(customer, 'b-1', { filename: 'a.png', mimeType: 'image/png', totalBytes: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a COMPLETED thread readable AND writable (chat continues after the visit)', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking('COMPLETED'));
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.findMany.mockResolvedValue([]);
    await expect(service.list(customer, 'b-1', { page: 1, limit: 50 })).resolves.toMatchObject({ total: 0 });
    prisma.chatMessage.create.mockResolvedValue({ id: 'm-x', bookingId: 'b-1', senderId: 'u-cust', body: 'hi', mediaKey: null });
    await expect(service.send(customer, 'b-1', { body: 'hi' })).resolves.toBeDefined();
  });

  it('lets an admin read any thread', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking('CANCELLED'));
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.findMany.mockResolvedValue([]);
    await expect(service.list(admin, 'b-1', { page: 1, limit: 50 })).resolves.toMatchObject({ items: [] });
  });

  it('accepts replyToId on send and returns it', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'm-0' });
    prisma.chatMessage.create.mockResolvedValue({
      id: 'm-1', body: 'yes', mediaKey: null, deletedAt: null, replyToId: 'm-0',
      replyTo: { id: 'm-0', body: 'ok?', deletedAt: null }, type: 'TEXT',
    });
    const msg = await service.send(customer, 'b-1', { body: 'yes', replyToId: 'm-0' });
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replyToId: 'm-0' }) }),
    );
    expect(msg).toMatchObject({ replyToId: 'm-0' });
  });
});

describe('ChatService — delete message', () => {
  it('soft-deletes the sender\'s own message and tells both parties', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'm-1', senderId: 'u-cust', createdAt: new Date(), deletedAt: null });
    const deletedAt = new Date();
    prisma.chatMessage.update.mockResolvedValue({
      id: 'm-1', body: 'secret', mediaKey: 'k', mimeType: 'image/png', sizeBytes: 3, deletedAt, replyTo: null,
    });
    const result = await service.deleteMessage(customer, 'b-1', 'm-1');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm-1' }, data: { deletedAt: expect.any(Date) } }),
    );
    expect(result).toMatchObject({ id: 'm-1', body: null, url: null, deletedAt });
    expect(result).not.toHaveProperty('mediaKey');
    expect(realtime.entityUpdated).toHaveBeenCalledWith(
      { users: ['u-cust', 'u-cg'] },
      expect.objectContaining({ type: 'chat_message', id: 'm-1', action: 'deleted' }),
    );
  });

  it('refuses someone else\'s message', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'm-1', senderId: 'u-cust', createdAt: new Date(), deletedAt: null });
    await expect(service.deleteMessage(caregiverUser, 'b-1', 'm-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses once the grace window has passed', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.chatMessage.findFirst.mockResolvedValue({
      id: 'm-1', senderId: 'u-cust', createdAt: new Date(Date.now() - 2 * 3600_000), deletedAt: null,
    });
    await expect(service.deleteMessage(customer, 'b-1', 'm-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('lists deleted messages as tombstones', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.chatMessage.findMany.mockResolvedValue([
      { id: 'm-2', body: 'reply', mediaKey: null, deletedAt: null, replyTo: { id: 'm-1', body: 'gone', deletedAt: new Date() } },
    ]);
    const page = await service.list(customer, 'b-1', { page: 1, limit: 50 });
    expect(page.items[0]).toMatchObject({ body: 'reply', replyTo: { body: null } });
  });
});

describe('ChatService — conversations per person', () => {
  it('groups bookings with the same caregiver into one conversation', async () => {
    const { service, prisma } = makeService();
    const cg = { id: 'cg-1', userId: 'u-cg', user: { fullName: 'Nurse' } };
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b-2', status: 'CONFIRMED', createdAt: new Date('2026-10-02'), customer: { id: 'u-cust', fullName: 'C' }, caregiver: cg },
      { id: 'b-1', status: 'COMPLETED', createdAt: new Date('2026-10-01'), customer: { id: 'u-cust', fullName: 'C' }, caregiver: cg },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(3);
    const conversations = await service.listConversations(customer);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      counterpartUserId: 'u-cg', bookingIds: ['b-2', 'b-1'], activeBookingId: 'b-2', unreadCount: 3,
    });
  });

  it('merges history across the pair\'s bookings', async () => {
    const { service, prisma } = makeService();
    const cg = { id: 'cg-1', userId: 'u-cg', user: { fullName: 'Nurse' } };
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b-2', status: 'CONFIRMED', createdAt: new Date(), customer: { id: 'u-cust', fullName: 'C' }, caregiver: cg },
      { id: 'b-1', status: 'COMPLETED', createdAt: new Date(), customer: { id: 'u-cust', fullName: 'C' }, caregiver: cg },
    ]);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.findMany.mockResolvedValue([]);
    await service.listConversationMessages(customer, 'u-cg', { page: 1, limit: 50 });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: { in: ['b-2', 'b-1'] } } }),
    );
  });
});
