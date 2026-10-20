import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, flushOtpKeys, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { RedisService } from '../src/common/redis/redis.module.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let close: () => Promise<void>;
  const createdPhones: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, redis, close } = await createTestApp());
  });

  afterEach(async () => {
    await flushOtpKeys(redis);
  });

  afterAll(async () => {
    if (createdPhones.length > 0) {
      await prisma.user.deleteMany({ where: { phone: { in: createdPhones } } });
    }
    await close();
  });

  it('rejects an invalid phone format on OTP request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  it('requests an OTP and stores a hashed code in Redis', async () => {
    const phone = uniquePhone();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.ttlSeconds).toBeGreaterThan(0);
    const stored = await redis.client.get(`otp:LOGIN:${phone}`);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects OTP verification with no requested code', async () => {
    const phone = uniquePhone();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '000000' });
    expect(res.status).toBe(401);
  });

  it('rejects an incorrect OTP', async () => {
    const phone = uniquePhone();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '999999' });
    expect(res.status).toBe(401);
  });

  it('rate-limits excessive OTP requests', async () => {
    const phone = uniquePhone();
    let last = 0;
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone });
      last = res.status;
    }
    expect(last).toBe(403);
  });

  it('rejects refresh with a garbage token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' });
    expect(res.status).toBe(401);
  });

  it('logs out gracefully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'whatever' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/customer/me');
    expect(res.status).toBe(401);
  });

  it('rejects a protected route with an invalid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customer/me')
      .set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });
});
