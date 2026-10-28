import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

/**
 * Full lifecycle: customer books -> caregiver accepts -> en-route -> check-in
 * -> check-out -> note -> review, plus cancellation and authorization checks.
 */
describe('Booking & visit lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let customerToken: string;
  let caregiverToken: string;
  let otherCustomerToken: string;

  let customerId: string;
  let otherCustomerId: string;
  let caregiverUserId: string;
  let caregiverProfileId: string;
  let patientId: string;
  let addressId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());

    const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const other = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const caregiverUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER' },
    });
    customerId = customer.id;
    otherCustomerId = other.id;
    caregiverUserId = caregiverUser.id;
    createdUserIds.push(customer.id, other.id, caregiverUser.id);

    customerToken = signAccessToken(jwt, customer);
    otherCustomerToken = signAccessToken(jwt, other);

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
        ratePerVisit: 6000,
        commissionRateId: commission.id,
        verificationStatus: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    caregiverProfileId = profile.id;
    caregiverToken = signAccessToken(jwt, {
      id: caregiverUserId,
      role: 'CAREGIVER',
      phone: caregiverUser.phone,
    });

    const patient = await prisma.patientProfile.create({
      data: { ownerUserId: customerId, name: 'E2E Patient', relationship: 'SELF' },
    });
    patientId = patient.id;
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        addressLine: '1 E2E Street',
        city: 'Lahore',
        latitude: '31.5204',
        longitude: '74.3587',
      },
    });
    addressId = address.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [customerId, caregiverUserId, otherCustomerId] } },
    });
    await prisma.incidentEvent.deleteMany({
      where: { incident: { reportedById: customerId } },
    });
    await prisma.safetyIncident.deleteMany({ where: { reportedById: customerId } });
    await prisma.review.deleteMany({ where: { customerId } });
    await prisma.visitNote.deleteMany({ where: { caregiver: { userId: caregiverUserId } } });
    await prisma.visitStatusHistory.deleteMany({
      where: { visit: { booking: { customerId } } },
    });
    await prisma.payment.deleteMany({ where: { visit: { booking: { customerId } } } });
    await prisma.visit.deleteMany({ where: { booking: { customerId } } });
    await prisma.booking.deleteMany({ where: { customerId } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: customerId } });
    await prisma.address.deleteMany({ where: { userId: customerId } });
    await prisma.caregiverStrike.deleteMany({ where: { caregiver: { userId: caregiverUserId } } });
    await prisma.caregiverProfile.deleteMany({ where: { userId: caregiverUserId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  });

  let bookingId: string;
  let visitId: string;

  it('creates a booking and generates one REQUESTED visit', async () => {
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
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
    expect(res.body.visits).toHaveLength(1);
    bookingId = res.body.id;
    visitId = res.body.visits[0].id;
  });

  it('rejects a booking with an inverted time window', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-03-03',
        endDate: '2026-03-03',
        timeWindowStart: '11:00',
        timeWindowEnd: '09:00',
      });
    expect(res.status).toBe(400);
  });

  it('hides the booking from another customer', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/customer/bookings/${bookingId}`)
      .set(bearer(otherCustomerToken));
    expect(res.status).toBe(404);
  });

  it('shows the booking to the caregiver waiting for a response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/caregiver/bookings?status=REQUESTED')
      .set(bearer(caregiverToken));
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toContain(bookingId);
  });

  it('lets the caregiver accept the booking, confirming visits', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/bookings/${bookingId}/accept`)
      .set(bearer(caregiverToken))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.visits[0].status).toBe('CONFIRMED');
  });

  it('rejects accepting an already confirmed booking', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/bookings/${bookingId}/accept`)
      .set(bearer(caregiverToken))
      .send({});
    expect(res.status).toBe(400);
  });

  it('exposes visit context including the patient to the caregiver (FR-CG6)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/caregiver/visits/${visitId}`)
      .set(bearer(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.booking.patient.name).toBe('E2E Patient');
  });

  it('walks the visit through the full state machine', async () => {
    const server = app.getHttpServer();
    const enRoute = await request(server)
      .post(`/api/v1/caregiver/visits/${visitId}/en-route`)
      .set(bearer(caregiverToken));
    expect(enRoute.status).toBe(201);
    expect(enRoute.body.status).toBe('EN_ROUTE');

    const checkIn = await request(server)
      .post(`/api/v1/caregiver/visits/${visitId}/check-in`)
      .set(bearer(caregiverToken))
      .send({ method: 'GPS', lat: 31.5204, lng: 74.3587 });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.status).toBe('CHECKED_IN');

    const checkOut = await request(server)
      .post(`/api/v1/caregiver/visits/${visitId}/check-out`)
      .set(bearer(caregiverToken))
      .send({ method: 'GPS', lat: 31.5204, lng: 74.3587 });
    expect(checkOut.status).toBe(201);
    expect(checkOut.body.status).toBe('CHECKED_OUT');
  });

  it('rejects GPS check-in without coordinates', async () => {
    const server = app.getHttpServer();
    const second = await prisma.visit.create({
      data: {
        bookingId,
        scheduledDate: new Date('2026-03-09T00:00:00.000Z'),
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        status: 'CONFIRMED',
      },
    });
    const res = await request(server)
      .post(`/api/v1/caregiver/visits/${second.id}/check-in`)
      .set(bearer(caregiverToken))
      .send({ method: 'GPS' });
    expect(res.status).toBe(400);
    await prisma.visit.delete({ where: { id: second.id } });
  });

  it('blocks closing the visit until cash is verified by BOTH sides', async () => {
    const server = app.getHttpServer();
    const note = () =>
      request(server)
        .post(`/api/v1/caregiver/visits/${visitId}/note`)
        .set(bearer(caregiverToken))
        .send({ summary: 'Dressing changed, vitals stable.' });

    // 1. nothing paid yet
    const none = await note();
    expect(none.status).toBe(400);
    expect(none.body.message).toMatch(/no payment has been made/);

    // 2. the customer starts a cash payment: still blocked
    const started = await request(server)
      .post('/api/v1/customer/payments')
      .set(bearer(customerToken))
      .send({ visitId, method: 'CASH' });
    expect(started.status).toBe(201);
    const paymentId = started.body.id as string;
    expect((await note()).status).toBe(400);

    // 3. the caregiver confirms receiving it: PENDING, still blocked
    const caregiverSide = await request(server)
      .post(`/api/v1/caregiver/payments/${paymentId}/confirm-cash`)
      .set(bearer(caregiverToken))
      .send({ note: 'Received Rs 1500' });
    expect(caregiverSide.status).toBe(201);
    expect(caregiverSide.body.status).toBe('PENDING');
    expect(caregiverSide.body.caregiverConfirmedAt).toBeTruthy();
    expect(caregiverSide.body.customerConfirmedAt).toBeNull();
    const blocked = await note();
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/customer has not confirmed handing over/);

    // 4. the customer confirms handing it over: PAID, with both checks stored
    const customerSide = await request(server)
      .post(`/api/v1/customer/payments/${paymentId}/confirm-cash`)
      .set(bearer(customerToken));
    expect(customerSide.status).toBe(201);
    expect(customerSide.body.status).toBe('PAID');
    expect(customerSide.body.customerConfirmedAt).toBeTruthy();
    expect(customerSide.body.caregiverConfirmedAt).toBeTruthy();
    expect(customerSide.body.confirmationNote).toBe('Received Rs 1500');
  });

  it('completes the visit with a note (FR-CG8)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/visits/${visitId}/note`)
      .set(bearer(caregiverToken))
      .send({ summary: 'Dressing changed, vitals stable.' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.note.summary).toContain('Dressing');
  });

  it('shows the completed visit and note to the customer (FR-C11)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/customer/visits/${visitId}`)
      .set(bearer(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.note.summary).toContain('Dressing');
    expect(res.body.statusHistory.length).toBeGreaterThanOrEqual(5);
  });

  it('accepts a review and rolls up the caregiver rating (FR-C12)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/customer/visits/${visitId}/review`)
      .set(bearer(customerToken))
      .send({ rating: 5, comment: 'Excellent care' });
    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(5);

    const profile = await prisma.caregiverProfile.findUnique({
      where: { id: caregiverProfileId },
    });
    expect(Number(profile?.ratingAverage)).toBe(5);
    expect(profile?.ratingCount).toBe(1);
  });

  it('rejects reviewing the same visit twice', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/customer/visits/${visitId}/review`)
      .set(bearer(customerToken))
      .send({ rating: 3 });
    expect(res.status).toBe(400);
  });

  it('records a customer safety report (FR-C14)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/customer/visits/${visitId}/safety-reports`)
      .set(bearer(customerToken))
      .send({ description: 'Caregiver arrived late', priority: 'LOW' });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe('CUSTOMER_COMPLAINT');
  });

  it('produces a notification for the customer on confirmation', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set(bearer(customerToken));
    expect(res.status).toBe(200);
    const events = (res.body.items as Array<{ event: string }>).map((n) => n.event);
    expect(events).toContain('booking.confirmed');
  });

  it('cancels a separate requested booking (FR-C13)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        timeWindowStart: '10:00',
        timeWindowEnd: '12:00',
      });
    expect(create.status).toBe(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/customer/bookings/${create.body.id}/cancel`)
      .set(bearer(customerToken))
      .send({ reason: 'plan changed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });
});
