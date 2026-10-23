import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('Admin: promos, disputes, analytics, reports, safety (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let customerToken: string;
  let adminToken: string;

  let customerId: string;
  let caregiverUserId: string;
  let caregiverProfileId: string;
  let patientId: string;
  let addressId: string;
  let promoId: string;
  let visitId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());

    const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const caregiverUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER' },
    });
    const admin = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'ADMIN', fullName: 'E2E Admin 8' },
    });
    customerId = customer.id;
    caregiverUserId = caregiverUser.id;
    createdUserIds.push(customer.id, caregiverUser.id, admin.id);

    customerToken = signAccessToken(jwt, customer);
    adminToken = signAccessToken(jwt, admin);

    const commission = await prisma.commissionRate.findUniqueOrThrow({
      where: { category: 'NURSING' },
    });
    const profile = await prisma.caregiverProfile.create({
      data: {
        userId: caregiverUserId,
        cnic: `35201-${Math.floor(Math.random() * 1e7)}-1`,
        licenseNumber: `PNC-${Math.floor(Math.random() * 1e6)}`,
        licenseBody: 'PNC',
        specialty: 'NURSING',
        serviceArea: { cities: ['Lahore'] },
        ratePerVisit: 4000,
        commissionRateId: commission.id,
        verificationStatus: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    caregiverProfileId = profile.id;

    const patient = await prisma.patientProfile.create({
      data: { ownerUserId: customerId, name: 'Admin8 Patient', relationship: 'SELF' },
    });
    patientId = patient.id;
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        addressLine: '8 Admin Street',
        city: 'Lahore',
        latitude: '31.5204',
        longitude: '74.3587',
      },
    });
    addressId = address.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.dispute.deleteMany({ where: { raisedById: { in: createdUserIds } } });
    await prisma.incidentEvent.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.safetyIncident.deleteMany({ where: { reportedById: { in: createdUserIds } } });
    await prisma.payment.deleteMany({ where: { visit: { booking: { customerId } } } });
    await prisma.visit.deleteMany({ where: { booking: { customerId } } });
    await prisma.booking.deleteMany({ where: { customerId } });
    await prisma.promoCode.deleteMany({ where: { code: { startsWith: 'E2E8' } } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: customerId } });
    await prisma.address.deleteMany({ where: { userId: customerId } });
    await prisma.caregiverProfile.deleteMany({ where: { id: caregiverProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  });

  it('lets an admin create a percent promo code (FR-A8)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/promos')
      .set(bearer(adminToken))
      .send({
        code: 'E2E8SAVE10',
        discountType: 'PERCENT',
        discountValue: 10,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('E2E8SAVE10');
    promoId = res.body.id;
  });

  it('rejects a duplicate promo code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/promos')
      .set(bearer(adminToken))
      .send({
        code: 'E2E8SAVE10',
        discountType: 'PERCENT',
        discountValue: 10,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(409);
  });

  it('applies the promo discount when creating a booking', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-03-02',
        endDate: '2026-03-02',
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        promoCode: 'e2e8save10',
      });
    expect(res.status).toBe(201);
    expect(res.body.discountAmount).toBe(400);
    visitId = res.body.visits[0].id;
  });

  it('increments the promo usage count on redemption', async () => {
    const promo = await prisma.promoCode.findUnique({ where: { id: promoId } });
    expect(promo?.usesCount).toBe(1);
  });

  it('rejects a booking with an unknown promo code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-03-03',
        endDate: '2026-03-03',
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        promoCode: 'NOPE',
      });
    expect(res.status).toBe(400);
  });

  it('lets a customer raise a dispute and an admin resolve it (FR-A7)', async () => {
    // Disputes can target any visit the customer owns.
    const raise = await request(app.getHttpServer())
      .post('/api/v1/disputes')
      .set(bearer(customerToken))
      .send({ visitId, description: 'Caregiver arrived late and left early' });
    expect(raise.status).toBe(201);
    expect(raise.body.status).toBe('OPEN');

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/disputes?status=OPEN')
      .set(bearer(adminToken));
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toContain(raise.body.id);

    const resolve = await request(app.getHttpServer())
      .patch(`/api/v1/admin/disputes/${raise.body.id}/resolve`)
      .set(bearer(adminToken))
      .send({ resolutionNote: 'Apologised and issued credit' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.status).toBe('RESOLVED');
  });

  it('rejects resolving an already resolved dispute', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/disputes?status=RESOLVED')
      .set(bearer(adminToken));
    const id = (list.body.items as Array<{ id: string }>)[0].id;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/disputes/${id}/resolve`)
      .set(bearer(adminToken))
      .send({ resolutionNote: 'again' });
    expect(res.status).toBe(400);
  });

  it('lets a customer file a safety report that an admin can triage (FR-A6)', async () => {
    const report = await request(app.getHttpServer())
      .post(`/api/v1/customer/visits/${visitId}/safety-reports`)
      .set(bearer(customerToken))
      .send({ description: 'Suspicious person at the door', priority: 'HIGH' });
    expect(report.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/safety-incidents?status=OPEN')
      .set(bearer(adminToken));
    expect(list.status).toBe(200);
    const incidentId = (list.body.items as Array<{ id: string }>)[0].id;

    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/admin/safety-incidents/${incidentId}`)
      .set(bearer(adminToken))
      .send({ status: 'IN_REVIEW', note: 'Contacted customer' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('IN_REVIEW');
  });

  it('returns platform analytics to an admin (FR-A5)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics?range=all')
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.bookings.total).toBeGreaterThanOrEqual(1);
    expect(res.body.caregivers.active).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.bookings.cancellationRate).toBe('number');
  });

  it('rejects analytics for non-admins', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics')
      .set(bearer(customerToken));
    expect(res.status).toBe(403);
  });

  it('exports bookings as a CSV report (FR-A9)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/export?type=bookings')
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toContain('id,customerId,customerName,caregiverId');
  });
});
