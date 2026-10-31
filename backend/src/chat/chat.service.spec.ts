import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  const realtime = { entityUpdated: vi.fn(), emit: vi.fn() };
  const storage = {
    validateChatMediaUpload: vi.fn(),
    putChatMedia: vi.fn().mockResolvedValue({
      fileKey: 'bookings/b-1/media/1-note.webm',
      mimeType: 'audio/webm',
      sizeBytes: 3,
    }),
    presignedGet: vi.fn().mockResolvedValue('https://files.test/note.webm'),
  };
  const redis = {
    client: {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      hset: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({}),
      expire: vi.fn().mockResolvedValue(1),
    },
  };
  const service = new ChatService(
    prisma as never,
    audit as never,
    storage as never,
    redis as never,
    realtime as never,
  );
  return { service, prisma, audit, realtime, storage, redis };
}

const booking = { id: 'b-1', status: 'CONFIRMED', customerId: 'u-cust', caregiver: { userId: 'u-cg' } };

describe('ChatService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a party not on the booking', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(service.send(stranger, 'b-1', { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the customer send a message and notifies the caregiver', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.create.mockResolvedValue({
      id: 'msg-1',
      bookingId: 'b-1',
      senderId: 'u-cust',
      body: 'hi',
      type: 'TEXT',
      replyToId: null,
      mediaKey: null,
    });

    const result = await service.send(customer, 'b-1', { body: 'hi' });

    expect(result).toMatchObject({ id: 'msg-1', url: null });
    expect(realtime.entityUpdated).toHaveBeenCalledWith(
      { users: ['u-cg'] },
      expect.objectContaining({ type: 'chat_message', action: 'created' }),
    );
  });

  it('lets the caregiver send a message and notifies the customer', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.create.mockResolvedValue({
      id: 'msg-2',
      bookingId: 'b-1',
      senderId: 'u-cg',
      body: 'omw',
      mediaKey: null,
    });

    await service.send(caregiverUser, 'b-1', { body: 'omw' });

    expect(realtime.entityUpdated).toHaveBeenCalledWith({ users: ['u-cust'] }, expect.anything());
  });

  it('still lets both parties send after the booking is COMPLETED (chat stays open post-visit)', async () => {
    const { service, prisma, realtime } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ ...booking, status: 'COMPLETED' });
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-3', bookingId: 'b-1', senderId: 'u-cust', body: 'hi', mediaKey: null });
    await service.send(customer, 'b-1', { body: 'hi' });
    expect(realtime.entityUpdated).toHaveBeenCalled();
  });

  it('rejects sending on a cancelled/declined booking (never opened)', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ ...booking, status: 'CANCELLED' });
    await expect(service.send(customer, 'b-1', { body: 'hi' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a reply to a message from another booking', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    await expect(
      service.send(customer, 'b-1', { body: 'hi', replyToId: 'msg-elsewhere' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paginates the thread', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.chatMessage.findMany.mockResolvedValue([{ id: 'msg-1', mediaKey: null }]);
    await expect(service.list(customer, 'b-1', { page: 1, limit: 50 })).resolves.toEqual({
      items: [{ id: 'msg-1', mediaKey: null, url: null }],
      page: 1,
      limit: 50,
      total: 1,
    });
  });

  it('resolves a viewable url for a media message', async () => {
    const { service, prisma, storage } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.chatMessage.findMany.mockResolvedValue([
      { id: 'msg-1', mediaKey: 'bookings/b-1/media/1-note.webm' },
    ]);
    const result = await service.list(customer, 'b-1', { page: 1, limit: 50 });
    expect(result.items[0]).toMatchObject({ id: 'msg-1', url: 'https://files.test/note.webm' });
    expect(storage.presignedGet).toHaveBeenCalled();
  });

  it('marks only the other party\'s messages as read', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });
    await expect(service.markRead(customer, 'b-1')).resolves.toEqual({ updated: 3 });
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 'b-1', senderId: { not: 'u-cust' }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('marks a single message as read', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue(booking);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.markOneRead(customer, 'b-1', 'msg-1')).resolves.toEqual({ updated: 1 });
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', bookingId: 'b-1', senderId: { not: 'u-cust' }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  describe('reactions', () => {
    it('404s reacting to a message outside the booking', async () => {
      const { service, prisma } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      await expect(service.react(customer, 'b-1', 'msg-1', { emoji: '👍' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('adds a reaction and notifies the other party', async () => {
      const { service, prisma, realtime } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      prisma.chatMessage.findFirst.mockResolvedValue({ id: 'msg-1', senderId: 'u-cg' });
      prisma.messageReaction.findUnique.mockResolvedValue(null);
      prisma.messageReaction.create.mockResolvedValue({ id: 'r-1' });

      const result = await service.react(customer, 'b-1', 'msg-1', { emoji: '👍' });

      expect(result).toEqual({ ok: true, action: 'added' });
      expect(prisma.messageReaction.create).toHaveBeenCalledWith({
        data: { messageId: 'msg-1', userId: 'u-cust', emoji: '👍' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(
        { users: ['u-cg'] },
        'message.reaction',
        expect.objectContaining({ action: 'added', emoji: '👍' }),
      );
    });

    it('removes the reaction when reacting again with the same emoji', async () => {
      const { service, prisma } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      prisma.chatMessage.findFirst.mockResolvedValue({ id: 'msg-1', senderId: 'u-cg' });
      prisma.messageReaction.findUnique.mockResolvedValue({ id: 'r-1' });
      prisma.messageReaction.delete.mockResolvedValue({});

      const result = await service.react(customer, 'b-1', 'msg-1', { emoji: '👍' });

      expect(result).toEqual({ ok: true, action: 'removed' });
      expect(prisma.messageReaction.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } });
    });
  });

  describe('resumable media uploads', () => {
    it('validates type/size and opens a session', async () => {
      const { service, prisma, storage, redis } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);

      const result = await service.initUpload(customer, 'b-1', {
        filename: 'note.webm',
        mimeType: 'audio/webm',
        totalBytes: 3,
      });

      expect(result.uploadId).toBeTruthy();
      expect(storage.validateChatMediaUpload).toHaveBeenCalledWith('audio/webm', 3);
      expect(redis.client.set).toHaveBeenCalledWith(
        `chatupload:${result.uploadId}:meta`,
        expect.stringContaining('"bookingId":"b-1"'),
        'EX',
        expect.any(Number),
      );
    });

    it('404s on an unknown or expired upload session', async () => {
      const { service, redis } = makeService();
      redis.client.get.mockResolvedValue(null);
      await expect(
        service.putChunk(customer, 'b-1', 'missing-id', 0, Buffer.from('x')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stores a chunk idempotently by index and reports received bytes', async () => {
      const { service, redis } = makeService();
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 6 }),
      );
      redis.client.hgetall.mockResolvedValue({ '0': Buffer.from('abc').toString('base64') });

      const result = await service.putChunk(customer, 'b-1', 'up-1', 0, Buffer.from('abc'));

      expect(redis.client.hset).toHaveBeenCalledWith('chatupload:up-1:chunks', '0', Buffer.from('abc').toString('base64'));
      expect(result).toEqual({ receivedBytes: 3, totalBytes: 6 });
    });

    it('reports progress with the received chunk indexes', async () => {
      const { service, redis } = makeService();
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 6 }),
      );
      redis.client.hgetall.mockResolvedValue({
        '1': Buffer.from('def').toString('base64'),
        '0': Buffer.from('abc').toString('base64'),
      });

      const result = await service.uploadProgress(customer, 'b-1', 'up-1');

      expect(result).toEqual({ receivedBytes: 6, totalBytes: 6, receivedIndexes: [0, 1] });
    });

    it('rejects completing an upload with a gap in chunk indexes', async () => {
      const { service, prisma, redis } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 6 }),
      );
      redis.client.hgetall.mockResolvedValue({ '0': Buffer.from('abc').toString('base64'), '2': Buffer.from('ghi').toString('base64') });

      await expect(service.completeUpload(customer, 'b-1', 'up-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects completing an upload whose assembled size does not match', async () => {
      const { service, prisma, redis } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 99 }),
      );
      redis.client.hgetall.mockResolvedValue({ '0': Buffer.from('abc').toString('base64') });

      await expect(service.completeUpload(customer, 'b-1', 'up-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('assembles chunks, stores the media, creates the message, and clears the session', async () => {
      const { service, prisma, storage, redis, realtime } = makeService();
      prisma.booking.findFirst.mockResolvedValue(booking);
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 3 }),
      );
      redis.client.hgetall.mockResolvedValue({ '0': Buffer.from('abc').toString('base64') });
      prisma.chatMessage.create.mockResolvedValue({
        id: 'msg-3',
        bookingId: 'b-1',
        senderId: 'u-cust',
        type: 'VOICE',
        mediaKey: 'bookings/b-1/media/1-note.webm',
        replyToId: null,
      });

      const result = await service.completeUpload(customer, 'b-1', 'up-1', { body: 'listen' });

      expect(storage.putChatMedia).toHaveBeenCalledWith(
        'bookings/b-1/media',
        'note.webm',
        Buffer.from('abc'),
        'audio/webm',
      );
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingId: 'b-1', senderId: 'u-cust', body: 'listen' }),
        }),
      );
      expect(redis.client.del).toHaveBeenCalledWith('chatupload:up-1:meta', 'chatupload:up-1:chunks');
      expect(realtime.entityUpdated).toHaveBeenCalledWith(
        { users: ['u-cg'] },
        expect.objectContaining({ type: 'chat_message', action: 'created' }),
      );
      expect(result).toMatchObject({ id: 'msg-3' });
    });

    it('aborts an in-progress upload and clears its session', async () => {
      const { service, redis } = makeService();
      redis.client.get.mockResolvedValue(
        JSON.stringify({ bookingId: 'b-1', userId: 'u-cust', filename: 'note.webm', mimeType: 'audio/webm', totalBytes: 3 }),
      );
      await expect(service.abortUpload(customer, 'b-1', 'up-1')).resolves.toEqual({ ok: true });
      expect(redis.client.del).toHaveBeenCalledWith('chatupload:up-1:meta', 'chatupload:up-1:chunks');
    });
  });
});
