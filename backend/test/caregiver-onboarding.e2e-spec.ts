import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('Caregiver onboarding -> verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let adminToken: string;
  let caregiverToken: string;
  let caregiverUserId: string;
  let caregiverProfileId: string;
  const caregiverPhone = uniquePhone();

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());

    const admin = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'ADMIN', fullName: 'E2E Admin' },
    });
    adminToken = signAccessToken(jwt, admin);

    const caregiver = await prisma.user.create({
      data: { phone: caregiverPhone, role: 'CUSTOMER' },
    });
    caregiverUserId = caregiver.id;
    caregiverToken = signAccessToken(jwt, caregiver);
  });

  afterAll(async () => {
    const admins = await prisma.user.findMany({
      where: { fullName: 'E2E Admin' },
      select: { id: true },
    });
    const adminIds = admins.map((a) => a.id);
    if (caregiverUserId) {
      const profiles = await prisma.caregiverProfile.findMany({
        where: { userId: caregiverUserId },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);
      await prisma.credentialReview.deleteMany({
        where: { OR: [{ caregiverId: { in: profileIds } }, { reviewerId: { in: adminIds } }] },
      });
      await prisma.caregiverDocument.deleteMany({ where: { caregiverId: { in: profileIds } } });
      await prisma.notification.deleteMany({ where: { userId: caregiverUserId } });
      await prisma.caregiverProfile.deleteMany({ where: { userId: caregiverUserId } });
      await prisma.user.deleteMany({ where: { id: caregiverUserId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: adminIds } } });
    await close();
  });

  it('registers a caregiver and promotes the user to CAREGIVER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/register')
      .set(bearer(caregiverToken))
      .send({
        cnic: '35201-1234567-1',
        licenseNumber: 'PNC-998877',
        licenseBody: 'PNC',
        specialty: 'NURSING',
        experienceYears: 5,
        bio: 'E2E caregiver',
        serviceCities: ['Lahore'],
        ratePerVisit: 5000,
      });
    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe('PENDING');
    caregiverProfileId = res.body.id;

    const user = await prisma.user.findUnique({ where: { id: caregiverUserId } });
    expect(user?.role).toBe('CAREGIVER');
  });

  it('rejects registering twice', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/register')
      .set(bearer(caregiverToken))
      .send({
        cnic: '35201-1234567-1',
        licenseNumber: 'PNC-998877',
        licenseBody: 'PNC',
        specialty: 'NURSING',
        serviceCities: ['Lahore'],
        ratePerVisit: 5000,
      });
    expect(res.status).toBe(404);
  });

  it('does not list a PENDING caregiver in public search', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/caregivers?city=Lahore');
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(caregiverProfileId);
  });

  it('surfaces the profile to the caregiver themselves', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/caregiver/profile')
      .set(bearer(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(caregiverProfileId);
  });

  it('forbids a caregiver from using admin endpoints', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/caregivers')
      .set(bearer(caregiverToken));
    expect(res.status).toBe(403);
  });

  it('rejects approving before any document is uploaded', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/caregivers/${caregiverProfileId}/approve`)
      .set(bearer(adminToken))
      .send({});
    expect(res.status).toBe(400);
  });

  it('uploads a verification document', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/documents')
      .set(bearer(caregiverToken))
      .field('type', 'LICENSE')
      .attach('file', Buffer.from('%PDF-1.4 e2e'), 'license.pdf');
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('LICENSE');
  });

  it('lets an admin list and approve the caregiver', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/caregivers?status=PENDING')
      .set(bearer(adminToken));
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(caregiverProfileId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/caregivers/${caregiverProfileId}/approve`)
      .set(bearer(adminToken))
      .send({ reason: 'PNC cross-checked' });
    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe('APPROVED');
  });

  it('now publishes the caregiver in public search and profile', async () => {
    const search = await request(app.getHttpServer()).get(
      '/api/v1/caregivers?city=Lahore&specialty=NURSING',
    );
    expect(search.status).toBe(200);
    const ids = (search.body.items as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(caregiverProfileId);

    const profile = await request(app.getHttpServer()).get(
      `/api/v1/caregivers/${caregiverProfileId}`,
    );
    expect(profile.status).toBe(200);
    expect(profile.body.specialty).toBe('NURSING');
  });

  it('suspends and re-activates the caregiver as admin', async () => {
    const suspend = await request(app.getHttpServer())
      .post(`/api/v1/admin/caregivers/${caregiverProfileId}/suspend`)
      .set(bearer(adminToken))
      .send({ reason: 'review' });
    expect(suspend.status).toBe(201);
    expect(suspend.body.verificationStatus).toBe('SUSPENDED');

    const reactivate = await request(app.getHttpServer())
      .post(`/api/v1/admin/caregivers/${caregiverProfileId}/reactivate`)
      .set(bearer(adminToken));
    expect(reactivate.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/caregivers/${caregiverProfileId}/approve`)
      .set(bearer(adminToken))
      .send({});
  });
});
