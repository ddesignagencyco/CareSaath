import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import Stripe from 'stripe';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

const WEBHOOK_SECRET = 'whsec_e2e_local_test_secret';

/**
 * Card payments through Stripe hosted Checkout. Talks to the real Stripe TEST
 * API (creates and expires Checkout Sessions) and signs webhook events locally,
 * so it needs STRIPE_SECRET_KEY=sk_test_... and is skipped without one.
 */
describe.skipIf(!process.env['STRIPE_SECRET_KEY']?.startsWith('sk_test_'))(
  'Stripe card payments (e2e)',
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let jwt: JwtService;
    let close: () => Promise<void>;
    let stripe: Stripe;

    let customerToken: string;
    let customerId: string;
    let caregiverUserId: string;
    let caregiverProfileId: string;
    let bookingId: string;
    let payVisitId: string;
    let cancelVisitId: string;
    const createdUserIds: string[] = [];

    const signedEvent = (type: string, session: Record<string, unknown>) => {
      const payload = JSON.stringify({
        id: `evt_${Math.random().toString(36).slice(2)}`,
        object: 'event',
        type,
        data: { object: { object: 'checkout.session', ...session } },
      });
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
      return { payload, header };
    };

    const postWebhook = (payload: string, signature: string) =>
      request(app.getHttpServer())
        .post('/api/v1/payments/webhook/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

    beforeAll(async () => {
      process.env['E2E_USE_STRIPE'] = 'true';
      ({ app, prisma, jwt, close } = await createTestApp());
      process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
      stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!);

      const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
      const caregiverUser = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CAREGIVER' } });
      customerId = customer.id;
      caregiverUserId = caregiverUser.id;
      createdUserIds.push(customer.id, caregiverUser.id);
      customerToken = signAccessToken(jwt, customer);

      const commission = await prisma.commissionRate.findUniqueOrThrow({ where: { category: 'ELDERLY_CARE' } });
      const profile = await prisma.caregiverProfile.create({
        data: {
          userId: caregiverUserId,
          cnic: `35201-${Math.floor(Math.random() * 1e7)}-1`,
          licenseNumber: `PNC-${Math.floor(Math.random() * 1e6)}`,
          licenseBody: 'PNC',
          specialty: 'ELDERLY_CARE',
          serviceArea: { cities: ['Lahore'] },
          // Stripe's minimum charge is roughly Rs 150, so use a realistic visit rate.
          ratePerVisit: 150000,
          commissionRateId: commission.id,
          verificationStatus: 'APPROVED',
          approvedAt: new Date(),
        },
      });
      caregiverProfileId = profile.id;
      const patient = await prisma.patientProfile.create({
        data: { ownerUserId: customerId, name: 'Stripe Patient', relationship: 'SELF' },
      });
      const address = await prisma.address.create({
        data: { userId: customerId, addressLine: '1 Card Street', city: 'Lahore', latitude: '31.5204', longitude: '74.3587' },
      });
      const booking = await prisma.booking.create({
        data: {
          customerId,
          patientId: patient.id,
          caregiverId: caregiverProfileId,
          addressId: address.id,
          startDate: new Date('2026-03-02T00:00:00.000Z'),
          endDate: new Date('2026-03-03T00:00:00.000Z'),
          timeWindowStart: '09:00',
          timeWindowEnd: '11:00',
          serviceType: 'ELDERLY_CARE',
          rateSnapshot: 150000,
          status: 'CONFIRMED',
          respondBy: new Date('2026-03-01T00:00:00.000Z'),
        },
      });
      bookingId = booking.id;
      const visit = (day: string) =>
        prisma.visit.create({
          data: {
            bookingId,
            scheduledDate: new Date(`2026-03-${day}T00:00:00.000Z`),
            timeWindowStart: '09:00',
            timeWindowEnd: '11:00',
            status: 'CONFIRMED',
          },
        });
      payVisitId = (await visit('02')).id;
      cancelVisitId = (await visit('03')).id;
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.payment.deleteMany({ where: { visit: { bookingId } } });
      await prisma.visit.deleteMany({ where: { bookingId } });
      await prisma.booking.deleteMany({ where: { id: bookingId } });
      await prisma.patientProfile.deleteMany({ where: { ownerUserId: customerId } });
      await prisma.address.deleteMany({ where: { userId: customerId } });
      await prisma.caregiverProfile.deleteMany({ where: { id: caregiverProfileId } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await close();
      delete process.env['E2E_USE_STRIPE'];
    });

    let paymentId: string;
    let sessionId: string;

    it('starts a Stripe Checkout session for a card payment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customer/payments')
        .set(bearer(customerToken))
        .send({ visitId: payVisitId, method: 'CARD' });
      expect(res.status).toBe(201);
      expect(res.body.payment.status).toBe('PENDING');
      expect(res.body.payment.amount).toBe(150000);
      expect(res.body.payment.gatewayRef).toMatch(/^cs_test_/);
      expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      paymentId = res.body.payment.id;
      sessionId = res.body.payment.gatewayRef;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      expect(session.currency).toBe('pkr');
      expect(session.amount_total).toBe(150000);
      expect(session.metadata?.['paymentId']).toBe(paymentId);
    });

    it('rejects a webhook with a bad signature and leaves the payment pending', async () => {
      const { payload } = signedEvent('checkout.session.completed', { id: sessionId });
      const res = await postWebhook(payload, 't=1,v1=deadbeef');
      expect(res.status).toBe(400);
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('PENDING');
    });

    it('ignores a signed event whose amount does not match', async () => {
      const { payload, header } = signedEvent('checkout.session.completed', {
        id: sessionId,
        payment_status: 'paid',
        currency: 'pkr',
        amount_total: 100,
        metadata: { paymentId },
      });
      const res = await postWebhook(payload, header);
      expect(res.status).toBe(200);
      expect(res.body.settled).toBe(false);
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('PENDING');
    });

    it('settles the payment on a signed paid event, idempotently', async () => {
      const paid = {
        id: sessionId,
        payment_status: 'paid',
        currency: 'pkr',
        amount_total: 150000,
        metadata: { paymentId },
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        const { payload, header } = signedEvent('checkout.session.completed', paid);
        const res = await postWebhook(payload, header);
        expect(res.status).toBe(200);
        expect(res.body.settled).toBe(true);
      }
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('PAID');
      expect(payment.paidAt).not.toBeNull();
    });

    it('closes the generic card webhook once Stripe is configured', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/card')
        .send({ gatewayRef: sessionId, status: 'PAID' });
      expect(res.status).toBe(404);
    });

    it('expires the Stripe session when the customer cancels', async () => {
      const started = await request(app.getHttpServer())
        .post('/api/v1/customer/payments')
        .set(bearer(customerToken))
        .send({ visitId: cancelVisitId, method: 'CARD' });
      expect(started.status).toBe(201);

      const cancelled = await request(app.getHttpServer())
        .patch(`/api/v1/customer/payments/${started.body.payment.id}/cancel`)
        .set(bearer(customerToken));
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('FAILED');

      const session = await stripe.checkout.sessions.retrieve(started.body.payment.gatewayRef);
      expect(session.status).toBe('expired');
    });
  },
);
