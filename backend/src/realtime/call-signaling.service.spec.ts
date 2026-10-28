import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CallSignalingService } from './call-signaling.service.js';
import { createPrismaMock } from '../../test/test-helpers.js';

function makeService() {
  const prisma = createPrismaMock();
  const service = new CallSignalingService(prisma as never);
  return { service, prisma };
}

describe('CallSignalingService.startCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects two users with no shared active visit', async () => {
    const { service, prisma } = makeService();
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.startCall('v-1', 'u-a', 'u-b')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.callLog.create).not.toHaveBeenCalled();
  });

  it('creates a CallLog for two users sharing an active visit', async () => {
    const { service, prisma } = makeService();
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1' });
    prisma.callLog.create.mockResolvedValue({ id: 'call-1', visitId: 'v-1', callerId: 'u-a', calleeId: 'u-b' });
    const result = await service.startCall('v-1', 'u-a', 'u-b');
    expect(result).toMatchObject({ id: 'call-1' });
    expect(prisma.callLog.create).toHaveBeenCalledWith({
      data: { visitId: 'v-1', callerId: 'u-a', calleeId: 'u-b', status: 'INITIATED' },
    });
  });
});

describe('CallSignalingService.loadForRouting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a user who is neither caller nor callee', async () => {
    const { service, prisma } = makeService();
    prisma.callLog.findUnique.mockResolvedValue({ id: 'call-1', callerId: 'u-a', calleeId: 'u-b' });
    await expect(service.loadForRouting('call-1', 'u-stranger')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows the caller and the callee', async () => {
    const { service, prisma } = makeService();
    prisma.callLog.findUnique.mockResolvedValue({ id: 'call-1', callerId: 'u-a', calleeId: 'u-b' });
    await expect(service.loadForRouting('call-1', 'u-a')).resolves.toMatchObject({ id: 'call-1' });
    await expect(service.loadForRouting('call-1', 'u-b')).resolves.toMatchObject({ id: 'call-1' });
  });
});

describe('CallSignalingService call lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks a call connected', async () => {
    const { service, prisma } = makeService();
    await service.markConnected('call-1');
    expect(prisma.callLog.update).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: { status: 'CONNECTED' },
    });
  });

  it('marks a call ended with a computed duration', async () => {
    const { service, prisma } = makeService();
    prisma.callLog.findUnique.mockResolvedValue({ id: 'call-1', startedAt: new Date(Date.now() - 30_000) });
    await service.markEnded('call-1');
    expect(prisma.callLog.update).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: expect.objectContaining({ status: 'ENDED', durationSec: expect.any(Number) }),
    });
    const durationSec = (prisma.callLog.update.mock.calls[0]![0] as { data: { durationSec: number } }).data
      .durationSec;
    expect(durationSec).toBeGreaterThanOrEqual(29);
  });

  it('marks a call rejected', async () => {
    const { service, prisma } = makeService();
    await service.markRejected('call-1');
    expect(prisma.callLog.update).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });
});
