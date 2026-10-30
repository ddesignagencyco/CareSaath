import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, flushOtpKeys, uniquePhone } from './e2e-helpers.js';
import type { RedisService } from '../src/common/redis/redis.module.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let redis: RedisService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, redis, close } = await createTestApp());
  });

  afterAll(async () => {
    await close();
  });

  it('GET /api/v1/health responds immediately without checking dependencies', async () => {
    // Deliberately dependency-free (see commit 01021ce): Render's load balancer
    // hits this on a tight timeout before Postgres/Redis are necessarily ready.
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready checks Postgres and Redis', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('returns a consistent error shape for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: expect.any(String) });
  });

  it('flushOtpKeys is idempotent on an empty store', async () => {
    await flushOtpKeys(redis);
    await expect(flushOtpKeys(redis)).resolves.toBeUndefined();
  });

  it('uniquePhone produces distinct phone numbers', () => {
    expect(uniquePhone()).not.toBe(uniquePhone());
  });
});
