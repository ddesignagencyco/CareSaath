import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { RedisService } from '../src/common/redis/redis.module.js';
import type { JwtService } from '@nestjs/jwt';

/**
 * Phase 10 hardening (e2e): operator-tunable platform config (admin read/update
 * with cache invalidation) and cached public caregiver search.
 */
describe('Phase 10 hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let adminToken: string;
  let caregiverToken: string;
  let caregiverUserId: string;

  const createdUserIds: string[] = [];
  const CONFIG_KEY = 'search.cacheTtlSeconds';

  beforeAll(async () => {
    ({ app, prisma, redis, jwt, close } = await createTestApp());

    const admin = await prisma.user.create({ data: { phone: uniquePhone(), role: 'ADMIN' } });
    const caregiverUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER', fullName: 'Phase10 Caregiver' },
    });
    caregiverUserId = caregiverUser.id;
    createdUserIds.push(admin.id, caregiverUser.id);

    adminToken = signAccessToken(jwt, admin);
    caregiverToken = signAccessToken(jwt, {
      id: caregiverUser.id,
      role: 'CAREGIVER',
      phone: caregiverUser.phone,
    });

    const commission = await prisma.commissionRate.findUniqueOrThrow({
      where: { category: 'NURSING' },
    });
    await prisma.caregiverProfile.create({
      data: {
        userId: caregiverUserId,
        cnic: `35201-${Math.floor(Math.random() * 1e7)}-1`,
        licenseNumber: `PNC-${Math.floor(Math.random() * 1e6)}`,
        licenseBody: 'PNC',
        specialty: 'NURSING',
        serviceArea: { cities: ['Phase10City'] },
        ratePerVisit: 6000,
        commissionRateId: commission.id,
        verificationStatus: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    await prisma.platformConfig.deleteMany({ where: { key: CONFIG_KEY } });
    await redis.client.del(`config:${CONFIG_KEY}`);
  });

  afterAll(async () => {
    await prisma.platformConfig.deleteMany({ where: { key: CONFIG_KEY } });
    await redis.client.del(`config:${CONFIG_KEY}`);
    const searchKeys = await redis.client.keys('search:caregivers:*');
    if (searchKeys.length > 0) {
      await redis.client.del(...searchKeys);
    }
    await prisma.caregiverDocument.deleteMany({
      where: { caregiver: { userId: { in: createdUserIds } } },
    });
    await prisma.caregiverProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  });

  it('lists platform config for an admin with env defaults', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/config')
      .set(bearer(adminToken))
      .expect(200);
    const keys = (res.body as Array<{ key: string }>).map((r) => r.key);
    expect(keys).toContain('booking.respondWindowMinutes');
    expect(keys).toContain('search.cacheTtlSeconds');
  });

  it('rejects config access for non-admins', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/config')
      .set(bearer(caregiverToken))
      .expect(403);
  });

  it('persists an override and invalidates the cache', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/admin/config/${CONFIG_KEY}`)
      .set(bearer(adminToken))
      .send({ value: 7 })
      .expect(200);

    const row = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
    expect(row?.value).toBe(7);
    expect(await redis.client.get(`config:${CONFIG_KEY}`)).toBeNull();

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/config')
      .set(bearer(adminToken))
      .expect(200);
    const entry = (res.body as Array<{ key: string; value: number; overridden: boolean }>).find(
      (r) => r.key === CONFIG_KEY,
    );
    expect(entry).toMatchObject({ value: 7, overridden: true });
  });

  it('caches public caregiver search results in Redis', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/caregivers?city=Phase10City&specialty=NURSING')
      .expect(200);
    const keys = await redis.client.keys('search:caregivers:*');
    expect(keys.length).toBeGreaterThan(0);

    const second = await request(app.getHttpServer())
      .get('/api/v1/caregivers?city=Phase10City&specialty=NURSING')
      .expect(200);
    expect(second.body).toEqual(first.body);
  });
});
