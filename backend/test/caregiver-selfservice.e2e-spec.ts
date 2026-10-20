import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('Caregiver availability & profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;
  let token: string;
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());
    const user = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER' },
    });
    userId = user.id;
    token = signAccessToken(jwt, user);
    const commission = await prisma.commissionRate.findUniqueOrThrow({
      where: { category: 'PHYSIOTHERAPY' },
    });
    const profile = await prisma.caregiverProfile.create({
      data: {
        userId,
        cnic: `35201-${Math.floor(Math.random() * 1e7)}-1`,
        licenseNumber: `PMDC-${Math.floor(Math.random() * 1e6)}`,
        licenseBody: 'PMDC',
        specialty: 'PHYSIOTHERAPY',
        serviceArea: { cities: ['Lahore'] },
        ratePerVisit: 7000,
        commissionRateId: commission.id,
      },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await prisma.availabilityRule.deleteMany({ where: { caregiverId: profileId } });
    await prisma.availabilityBlock.deleteMany({ where: { caregiverId: profileId } });
    await prisma.caregiverProfile.deleteMany({ where: { id: profileId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await close();
  });

  it('replaces the weekly availability set (FR-CG4)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/caregiver/availability')
      .set(bearer(token))
      .send({
        rules: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
          { dayOfWeek: 3, startTime: '10:00', endTime: '13:00' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(2);
  });

  it('rejects an invalid availability window', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/caregiver/availability')
      .set(bearer(token))
      .send({ rules: [{ dayOfWeek: 2, startTime: '18:00', endTime: '08:00' }] });
    expect(res.status).toBe(404);
  });

  it('adds and removes an availability block', async () => {
    const add = await request(app.getHttpServer())
      .post('/api/v1/caregiver/availability/blocks')
      .set(bearer(token))
      .send({ startDate: '2026-12-01', endDate: '2026-12-05', reason: 'leave' });
    expect(add.status).toBe(201);

    const get = await request(app.getHttpServer())
      .get('/api/v1/caregiver/availability')
      .set(bearer(token));
    expect(get.status).toBe(200);
    expect(get.body.blocks.length).toBeGreaterThanOrEqual(1);

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/caregiver/availability/blocks/${add.body.id}`)
      .set(bearer(token));
    expect(del.body).toEqual({ ok: true });
  });

  it('updates the caregiver profile', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/caregiver/profile')
      .set(bearer(token))
      .send({ ratePerVisit: 8000, bio: 'Updated bio' });
    expect(res.status).toBe(200);
    expect(res.body.ratePerVisit).toBe(8000);
    expect(res.body.bio).toBe('Updated bio');
  });

  it('uploads and fetches a profile photo URL', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/v1/caregiver/photo')
      .set(bearer(token))
      .attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), 'avatar.png');
    expect(upload.status).toBe(201);
    expect(upload.body.photoKey).toBeDefined();

    const url = await request(app.getHttpServer())
      .get('/api/v1/caregiver/photo/url')
      .set(bearer(token));
    expect(url.status).toBe(200);
    expect(url.body.url).toContain('http');
  });

  it('rejects an unsupported upload type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/photo')
      .set(bearer(token))
      .attach('file', Buffer.from('hello'), 'notes.txt');
    expect(res.status).toBe(400);
  });
});
