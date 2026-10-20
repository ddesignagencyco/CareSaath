import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

/**
 * Payment -> payout lifecycle: cash settle, gateway webhook idempotency,
 * commission config, caregiver earnings and admin payout approval.
 */
describe('Payments & payouts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let customerToken: string;
  let caregiverToken: string;
  let adminToken: string;

  let customerId: string;
  let caregiverUserId: string;
  let caregiverProfileId: string;
  let bookingId: string;
  let cashVisitId: string;
  let cardVisitId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());

    const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const caregiverUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER' },
    });
    const admin = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'ADMIN', fullName: 'E2E Pays Admin' },
    });
    customerId = customer.id;
    caregiverUserId = caregiverUser.id;
    createdUserIds.push(customer.id, caregiverUser.id, admin.id);

    customerToken = signAccessToken(jwt, customer);
    caregiverToken = signAccessToken(jwt, caregiverUser);
    adminToken = signAccessToken(jwt, admin);

    const commission = await prisma.commissionRate.findUniqueOrThrow({
      where: { category: 'ELDERLY_CARE' },
    });
    const profile = await prisma.caregiverProfile.create({
      data: {
        userId: caregiverUserId,
        cnic: `35201-${Math.floor(Math.random() * 1e7)}-1`,
        licenseNumber: `PNC-${Math.floor(Math.random() * 1e6)}`,
        licenseBody: 'PNC',
        specialty: 'ELDERLY_CARE',
        serviceArea: { cities: ['Lahore'] },
        ratePerVisit: 5000,
        commissionRateId: commission.id,
        verificationStatus: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    caregiverProfileId = profile.id;

    const patient = await prisma.patientProfile.create({
      data: { ownerUserId: customerId, name: 'Pay Patient', relationship: 'SELF' },
    });
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        addressLine: '9 Pay Street',
        city: 'Lahore',
        latitude: '31.5204',
        longitude: '74.3587',
      },
    });
    const booking = await prisma.booking.create({
      data: {
        customerId,
        patientId: patient.id,
        caregiverId: caregiverProfileId,
        addressId: address.id,
        startDate: new Date('2026-03-02T00:00:00.000Z'),
        endDate: new Date('2026-03-02T00:00:00.000Z'),
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        serviceType: 'ELDERLY_CARE',
        rateSnapshot: 5000,
        status: 'CONFIRMED',
        respondBy: new Date('2026-03-01T00:00:00.000Z'),
      },
    });
    bookingId = booking.id;
    const cashVisit = await prisma.visit.create({
      data: {
        bookingId,
        scheduledDate: new Date('2026-03-02T00:00:00.000Z'),
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        status: 'CONFIRMED',
      },
    });
    const cardVisit = await prisma.visit.create({
      data: {
        bookingId,
        scheduledDate: new Date('2026-03-03T00:00:00.000Z'),
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        status: 'CONFIRMED',
      },
    });
    cashVisitId = cashVisit.id;
    cardVisitId = cardVisit.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.payment.deleteMany({ where: { visit: { bookingId } } });
    await prisma.payoutRequest.deleteMany({ where: { caregiverId: caregiverProfileId } });
    await prisma.payoutAccount.deleteMany({ where: { caregiverId: caregiverProfileId } });
    await prisma.visit.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: customerId } });
    await prisma.address.deleteMany({ where: { userId: customerId } });
    await prisma.caregiverProfile.deleteMany({ where: { id: caregiverProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  });

  it('rejects a customer accessing admin commissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/commissions')
      .set(bearer(customerToken));
    expect(res.status).toBe(403);
  });

  it('lets an admin update a category commission rate (FR-A4)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/admin/commissions/ELDERLY_CARE')
      .set(bearer(adminToken))
      .send({ percentage: 15 });
    expect(res.status).toBe(200);
    expect(Number(res.body.percentage)).toBe(15);
  });

  it('initiates a cash payment and computes the commission split (FR-C8)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/payments')
      .set(bearer(customerToken))
      .send({ visitId: cashVisitId, method: 'CASH' });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(5000);
    expect(res.body.commissionAmount).toBe(750);
    expect(res.body.caregiverAmount).toBe(4250);
    expect(res.body.status).toBe('PENDING');
  });

  it('rejects a duplicate payment for the same visit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/payments')
      .set(bearer(customerToken))
      .send({ visitId: cashVisitId, method: 'CASH' });
    expect(res.status).toBe(400);
  });

  it('lets the caregiver confirm the cash payment', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/customer/payments')
      .set(bearer(customerToken));
    const cash = (list.body.items as Array<{ id: string; method: string; status: string }>).find(
      (p) => p.method === 'CASH',
    );
    const res = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/payments/${cash!.id}/confirm-cash`)
      .set(bearer(caregiverToken));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PAID');
  });

  it('initiates a card payment and exposes a gateway reference', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/payments')
      .set(bearer(customerToken))
      .send({ visitId: cardVisitId, method: 'CARD' });
    expect(res.status).toBe(201);
    expect(res.body.gatewayRef).toMatch(/^gw_/);
  });

  it('settles the card payment via a public, idempotent webhook', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/customer/payments')
      .set(bearer(customerToken));
    const card = (list.body.items as Array<{ gatewayRef: string; method: string }>).find(
      (p) => p.method === 'CARD',
    );

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/card')
      .send({ gatewayRef: card!.gatewayRef, status: 'PAID' });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('PAID');

    const replay = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/card')
      .send({ gatewayRef: card!.gatewayRef, status: 'PAID' });
    expect(replay.status).toBe(201);
    expect(replay.body.status).toBe('PAID');
  });

  it('rejects a webhook for an unknown gateway reference', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/card')
      .send({ gatewayRef: 'gw_none', status: 'PAID' });
    expect(res.status).toBe(404);
  });

  it('shows the settled earnings to the caregiver (FR-CG9)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/caregiver/earnings')
      .set(bearer(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.availableAmount).toBe(8500);
    expect(res.body.lifetimeEarnings).toBe(8500);
  });

  it('creates a payout account with a masked number', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/payout-accounts')
      .set(bearer(caregiverToken))
      .send({
        type: 'BANK',
        provider: 'HBL',
        accountTitle: 'E2E Caregiver',
        accountNumber: 'PK36SCBL0000001123456702',
      });
    expect(res.status).toBe(201);
    expect(res.body.accountNumber).toBe('****6702');
  });

  it('rejects a payout request beyond available earnings', async () => {
    const accounts = await request(app.getHttpServer())
      .get('/api/v1/caregiver/payout-accounts')
      .set(bearer(caregiverToken));
    const accountId = (accounts.body as Array<{ id: string }>)[0].id;
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/payouts')
      .set(bearer(caregiverToken))
      .send({ payoutAccountId: accountId, amount: 999999 });
    expect(res.status).toBe(400);
  });

  it('creates a payout request within available earnings', async () => {
    const accounts = await request(app.getHttpServer())
      .get('/api/v1/caregiver/payout-accounts')
      .set(bearer(caregiverToken));
    const accountId = (accounts.body as Array<{ id: string }>)[0].id;
    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/payouts')
      .set(bearer(caregiverToken))
      .send({ payoutAccountId: accountId, amount: 8500 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
  });

  it('lets an admin approve then mark the payout paid', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/payouts?status=REQUESTED')
      .set(bearer(adminToken));
    expect(list.status).toBe(200);
    const payoutId = (list.body.items as Array<{ id: string }>)[0].id;

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${payoutId}/approve`)
      .set(bearer(adminToken))
      .send({});
    expect(approve.status).toBe(201);
    expect(approve.body.status).toBe('PROCESSING');

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${payoutId}/mark-paid`)
      .set(bearer(adminToken))
      .send({});
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('PAID');
  });

  it('removes settled earnings from the available pool after payout', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/caregiver/earnings')
      .set(bearer(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.availableAmount).toBe(0);
    expect(res.body.availableCount).toBe(0);
    expect(res.body.lifetimeEarnings).toBe(8500);
  });
});
