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
const binary = (res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

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
        status: 'CHECKED_OUT',
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

  it('settles cash only after the caregiver AND the customer confirm', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/customer/payments')
      .set(bearer(customerToken));
    const cash = (list.body.items as Array<{ id: string; method: string; status: string }>).find(
      (p) => p.method === 'CASH',
    );
    const caregiverSide = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/payments/${cash!.id}/confirm-cash`)
      .set(bearer(caregiverToken));
    expect(caregiverSide.status).toBe(201);
    expect(caregiverSide.body.status).toBe('PENDING');

    // earnings are not credited until both sides have confirmed
    const early = await request(app.getHttpServer()).get('/api/v1/caregiver/earnings').set(bearer(caregiverToken));
    expect(early.body.availableAmount).toBe(0);

    const customerSide = await request(app.getHttpServer())
      .post(`/api/v1/customer/payments/${cash!.id}/confirm-cash`)
      .set(bearer(customerToken));
    expect(customerSide.status).toBe(201);
    expect(customerSide.body.status).toBe('PAID');
  });

  it('initiates a card payment and exposes a gateway reference', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/payments')
      .set(bearer(customerToken))
      .send({ visitId: cardVisitId, method: 'CARD' });
    expect(res.status).toBe(201);
    expect(res.body.payment.gatewayRef).toMatch(/^gw_/);
    expect(res.body.checkoutUrl).toContain(res.body.payment.gatewayRef);
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

  it('lets an admin approve, transfer, and the caregiver confirm the payout', async () => {
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

    // The admin sending the money is not enough: the payout waits for the caregiver.
    const transferred = await request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${payoutId}/mark-transferred`)
      .set(bearer(adminToken))
      .send({ reference: 'TXN-E2E-1' });
    expect(transferred.status).toBe(201);
    expect(transferred.body.status).toBe('TRANSFERRED');
    expect(transferred.body.transferReference).toBe('TXN-E2E-1');
    expect(transferred.body.caregiverConfirmedAt).toBeNull();

    // The admin cannot jump it to PAID by calling the deprecated alias again.
    const again = await request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${payoutId}/mark-paid`)
      .set(bearer(adminToken))
      .send({});
    expect(again.status).toBe(400);

    // The caregiver reports it missing: still TRANSFERRED, issue recorded.
    const missing = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/payouts/${payoutId}/report-not-received`)
      .set(bearer(caregiverToken))
      .send({ note: 'Nothing in my wallet yet' });
    expect(missing.status).toBe(201);
    expect(missing.body.status).toBe('TRANSFERRED');
    expect(missing.body.issueNote).toBe('Nothing in my wallet yet');

    // The admin resends; the issue is cleared.
    const resent = await request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${payoutId}/mark-transferred`)
      .set(bearer(adminToken))
      .send({ reference: 'TXN-E2E-2' });
    expect(resent.status).toBe(201);
    expect(resent.body.transferReference).toBe('TXN-E2E-2');
    expect(resent.body.issueReportedAt).toBeNull();

    // Only the caregiver's confirmation completes it.
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/payouts/${payoutId}/confirm-received`)
      .set(bearer(caregiverToken));
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('PAID');
    expect(confirmed.body.caregiverConfirmedAt).toBeTruthy();
    expect(confirmed.body.processedAt).toBeTruthy();
  });

  it('downloads the payout transfer receipt as a PDF (caregiver and admin)', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/caregiver/payouts').set(bearer(caregiverToken));
    const payoutId = (list.body.items as Array<{ id: string }>)[0]!.id;
    for (const [path, token] of [
      [`/api/v1/caregiver/payouts/${payoutId}/receipt`, caregiverToken],
      [`/api/v1/admin/payouts/${payoutId}/receipt`, adminToken],
    ] as const) {
      const res = await request(app.getHttpServer()).get(path).set(bearer(token)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="caresaath-transfer-CS-PO-\d{4}-[0-9A-F]{8}\.pdf"$/);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
    const inline = await request(app.getHttpServer())
      .get(`/api/v1/caregiver/payouts/${payoutId}/receipt?inline=true`)
      .set(bearer(caregiverToken))
      .buffer(true)
      .parse(binary);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
  });

  it('downloads the payment receipt as a PDF only for the parties, and only once paid', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/customer/payments').set(bearer(customerToken));
    const items = list.body.items as Array<{ id: string; method: string; status: string }>;
    const cash = items.find((p) => p.method === 'CASH' && p.status === 'PAID')!;
    const unpaid = items.find((p) => p.status !== 'PAID');

    const customerCopy = await request(app.getHttpServer())
      .get(`/api/v1/customer/payments/${cash.id}/receipt`)
      .set(bearer(customerToken))
      .buffer(true)
      .parse(binary);
    expect(customerCopy.status).toBe(200);
    expect(customerCopy.headers['content-type']).toBe('application/pdf');
    expect(customerCopy.headers['content-disposition']).toMatch(/^attachment; filename="caresaath-receipt-CS-\d{4}-[0-9A-F]{8}\.pdf"$/);
    expect((customerCopy.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    for (const [path, token] of [
      [`/api/v1/caregiver/payments/${cash.id}/receipt`, caregiverToken],
      [`/api/v1/admin/payments/${cash.id}/receipt`, adminToken],
    ] as const) {
      const res = await request(app.getHttpServer()).get(path).set(bearer(token)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }

    // not available before verification, and not across roles
    if (unpaid) {
      const early = await request(app.getHttpServer())
        .get(`/api/v1/customer/payments/${unpaid.id}/receipt`)
        .set(bearer(customerToken));
      expect(early.status).toBe(400);
    }
    const wrongRole = await request(app.getHttpServer())
      .get(`/api/v1/customer/payments/${cash.id}/receipt`)
      .set(bearer(caregiverToken));
    expect(wrongRole.status).toBe(403);
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
