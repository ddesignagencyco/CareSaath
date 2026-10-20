import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from './platform-config.module.js';
import {
  createAuditMock,
  createPrismaMock,
  createRedisMock,
} from '../../test/test-helpers.js';

describe('ConfigService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let service: ConfigService;

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = createRedisMock();
    audit = createAuditMock();
    service = new ConfigService(prisma as never, redis as never, audit as never);
  });

  it('returns the cached value without hitting the database', async () => {
    redis.client.get.mockResolvedValue('42');
    await expect(service.getNumber('otp.ttlSeconds')).resolves.toBe(42);
    expect(prisma.platformConfig.findUnique).not.toHaveBeenCalled();
  });

  it('reads the DB override and caches it', async () => {
    redis.client.get.mockResolvedValue(null);
    prisma.platformConfig.findUnique.mockResolvedValue({ key: 'otp.ttlSeconds', value: 123 });
    await expect(service.getNumber('otp.ttlSeconds')).resolves.toBe(123);
    expect(redis.client.set).toHaveBeenCalledWith(
      'config:otp.ttlSeconds',
      '123',
      'EX',
      expect.any(Number),
    );
  });

  it('falls back to the env default when no row exists', async () => {
    redis.client.get.mockResolvedValue(null);
    prisma.platformConfig.findUnique.mockResolvedValue(null);
    await expect(service.getNumber('booking.respondWindowMinutes')).resolves.toBe(60);
  });

  it('rejects an unknown key', async () => {
    await expect(service.getNumber('nope.key')).rejects.toThrow(/Unknown config key/);
  });

  it('resolves every known setting and flags overrides', async () => {
    prisma.platformConfig.findMany.mockResolvedValue([
      { key: 'otp.ttlSeconds', value: 999 },
    ]);
    const resolved = await service.resolved();
    const otp = resolved.find((r) => r.key === 'otp.ttlSeconds');
    expect(otp).toMatchObject({ value: 999, overridden: true });
    expect(resolved.length).toBeGreaterThan(4);
  });

  it('persists, invalidates the cache and audits on set', async () => {
    prisma.platformConfig.upsert.mockResolvedValue({});
    const admin = { sub: 'admin-1', role: 'ADMIN', phone: '+920000000000' };
    const result = await service.set(admin as never, 'search.cacheTtlSeconds', 15);
    expect(result.value).toBe(15);
    expect(prisma.platformConfig.upsert).toHaveBeenCalled();
    expect(redis.client.del).toHaveBeenCalledWith('config:search.cacheTtlSeconds');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'config.updated', entityId: 'search.cacheTtlSeconds' }),
    );
  });

  it('rejects a negative or non-finite value', async () => {
    const admin = { sub: 'admin-1', role: 'ADMIN', phone: '+920000000000' };
    await expect(service.set(admin as never, 'otp.ttlSeconds', -1)).rejects.toThrow();
    await expect(service.set(admin as never, 'otp.ttlSeconds', Number.NaN)).rejects.toThrow();
  });
});
