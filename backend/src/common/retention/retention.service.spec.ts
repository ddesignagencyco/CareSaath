import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetentionService } from './retention.module.js';
import {
  createConfigMock,
  createPrismaMock,
  wireTransaction,
} from '../../../test/test-helpers.js';

describe('RetentionService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: RetentionService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    prisma.otpCode.deleteMany.mockResolvedValue({ count: 2 });
    prisma.notification.deleteMany.mockResolvedValue({ count: 3 });
    service = new RetentionService(prisma as never, createConfigMock() as never);
  });

  it('purges expired and consumed OTPs plus old notifications', async () => {
    const result = await service.run(new Date('2026-01-01T00:00:00.000Z'));
    expect(result).toEqual({ expiredOtps: 2, consumedOtps: 2, oldNotifications: 3 });
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
    });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
        status: { in: ['SENT', 'FAILED'] },
      },
    });
  });

  it('does not schedule when retention is disabled, and clears on destroy', () => {
    vi.useFakeTimers();
    const prev = process.env['RETENTION_ENABLED'];
    process.env['RETENTION_ENABLED'] = 'false';
    const spy = vi.spyOn(service, 'run');
    service.onModuleInit();
    vi.advanceTimersByTime(120 * 60 * 1000);
    expect(spy).not.toHaveBeenCalled();
    service.onModuleDestroy();
    process.env['RETENTION_ENABLED'] = prev;
    vi.useRealTimers();
  });
});
