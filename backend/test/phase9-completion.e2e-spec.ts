import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, flushOtpKeys, signAccessToken, uniquePhone, VALID_PDF } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { RedisService } from '../src/common/redis/redis.module.js';
import { SmsService } from '../src/auth/sms.service.js';
import { maskValue } from '../src/common/crypto/field-encryption.js';
import type { JwtService } from '@nestjs/jwt';

/**
 * Phase 9 gap-fill (e2e): OTP visit check-in (FR-CG7), prescription upload
 * (FR-C5), visit reschedule (FR-C13), SOS (FR-C14) and CNIC/medical-context
 * encryption at rest.
 */
describe('Phase 9 completions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwt: JwtService;
  let close: () => Promise<void>;

  let customerToken: string;
  let caregiverToken: string;
  let adminToken: string;
  let customerId: string;
  let caregiverUserId: string;
  let caregiverProfileId: string;
  let patientId: string;
  let addressId: string;
  let bookingId: string;
  let visitId: string;

  const createdUserIds: string[] = [];
  const capturedOtp: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, redis, jwt, close } = await createTestApp());

    // Capture OTPs issued to any phone so the test can complete the OTP check-in.
    vi.spyOn(SmsService.prototype, 'sendOtp').mockImplementation(async (_phone, code) => {
      capturedOtp.push(code);
    });

    const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const caregiverUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CAREGIVER', fullName: 'Phase9 Caregiver' },
    });
    const admin = await prisma.user.create({ data: { phone: uniquePhone(), role: 'ADMIN' } });
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
      data: { ownerUserId: customerId, name: 'Phase9 Patient', relationship: 'SELF' },
    });
    patientId = patient.id;
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        addressLine: '9 Phase Street',
        city: 'Lahore',
        latitude: '31.5204',
        longitude: '74.3587',
      },
    });
    addressId = address.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.incidentEvent.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.safetyIncident.deleteMany({ where: { reportedById: { in: createdUserIds } } });
    await prisma.prescriptionDocument.deleteMany({ where: { booking: { customerId } } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: { booking: { customerId } } } });
    await prisma.otpCode.deleteMany({ where: { visitId: { not: null } } });
    await prisma.visit.deleteMany({ where: { booking: { customerId } } });
    await prisma.booking.deleteMany({ where: { customerId } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: customerId } });
    await prisma.address.deleteMany({ where: { userId: customerId } });
    await prisma.emergencyContact.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.caregiverDocument.deleteMany({ where: { caregiver: { userId: { in: createdUserIds } } } });
    await prisma.credentialReview.deleteMany({ where: { caregiver: { userId: { in: createdUserIds } } } });
    await prisma.caregiverProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await flushOtpKeys(redis);
    vi.restoreAllMocks();
    await close();
  });

  it('encrypts the patient medical context at rest and decrypts on read', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/patients')
      .set(bearer(customerToken))
      .send({ name: 'Encrypted Patient', medicalContext: 'type-2 diabetes' });
    expect(create.status).toBe(201);
    expect(create.body.medicalContext).toBe('type-2 diabetes');

    const raw = await prisma.patientProfile.findUniqueOrThrow({ where: { id: create.body.id } });
    expect(raw.medicalContext).not.toBe('type-2 diabetes');
    expect(raw.medicalContext).toContain(':');

    const get = await request(app.getHttpServer())
      .get(`/api/v1/customer/patients/${create.body.id}`)
      .set(bearer(customerToken));
    expect(get.body.medicalContext).toBe('type-2 diabetes');

    await prisma.patientProfile.delete({ where: { id: create.body.id } });
  });

  it('encrypts the caregiver CNIC at rest and masks it for the caregiver', async () => {
    const newUser = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CUSTOMER' },
    });
    createdUserIds.push(newUser.id);
    const newToken = signAccessToken(jwt, newUser);

    const reg = await request(app.getHttpServer())
      .post('/api/v1/caregiver/register')
      .set(bearer(newToken))
      .send({
        cnic: '35201-9999999-9',
        licenseNumber: 'PNC-ENC-1',
        licenseBody: 'PNC',
        specialty: 'NURSING',
        serviceCities: ['Lahore'],
        ratePerVisit: 5000,
      });
    expect(reg.status).toBe(201);

    const raw = await prisma.caregiverProfile.findUniqueOrThrow({ where: { id: reg.body.id } });
    expect(raw.cnic).toContain(':');
    expect(raw.cnic).not.toContain('35201-9999999-9');

    const me = await request(app.getHttpServer())
      .get('/api/v1/caregiver/profile')
      .set(bearer(newToken));
    expect(me.status).toBe(200);
    expect(me.body.cnic).toBe(maskValue('35201-9999999-9', 4));
    expect(me.body.cnic.startsWith('*')).toBe(true);
  });

  it('creates a booking and confirms it', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-05-04',
        endDate: '2026-05-04',
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
      });
    expect(create.status).toBe(201);
    bookingId = create.body.id;
    visitId = create.body.visits[0].id;

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/bookings/${bookingId}/accept`)
      .set(bearer(caregiverToken))
      .send({});
    expect(accept.body.status).toBe('CONFIRMED');
  });

  it('uploads a prescription document to the booking (FR-C5)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/customer/bookings/${bookingId}/prescriptions`)
      .set(bearer(customerToken))
      .attach('file', VALID_PDF, 'prescription.pdf');
    expect(res.status).toBe(201);
    expect(res.body.bookingId).toBe(bookingId);

    const booking = await request(app.getHttpServer())
      .get(`/api/v1/customer/bookings/${bookingId}`)
      .set(bearer(customerToken));
    expect(booking.body.prescriptions).toHaveLength(1);

    const signed = await request(app.getHttpServer())
      .get(`/api/v1/caregiver/bookings/${bookingId}/prescriptions/${res.body.id}`)
      .set(bearer(caregiverToken));
    expect(signed.status).toBe(200);
    expect(typeof signed.body.url).toBe('string');
  });

  it('checks in via OTP issued to the customer (FR-CG7)', async () => {
    const enRoute = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/visits/${visitId}/en-route`)
      .set(bearer(caregiverToken));
    expect(enRoute.body.status).toBe('EN_ROUTE');

    capturedOtp.length = 0;
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/visits/${visitId}/check-in-otp`)
      .set(bearer(caregiverToken));
    expect(issued.status).toBe(201);
    expect(capturedOtp).toHaveLength(1);
    const code = capturedOtp[0];

    const bad = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/visits/${visitId}/check-in`)
      .set(bearer(caregiverToken))
      .send({ method: 'OTP', code: '000000' });
    expect(bad.status).toBe(401);

    const good = await request(app.getHttpServer())
      .post(`/api/v1/caregiver/visits/${visitId}/check-in`)
      .set(bearer(caregiverToken))
      .send({ method: 'OTP', code });
    expect(good.status).toBe(201);
    expect(good.body.status).toBe('CHECKED_IN');
    expect(good.body.checkInMethod).toBe('OTP');
  });

  it('reschedules a confirmed visit into a linked replacement (FR-C13)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/bookings')
      .set(bearer(customerToken))
      .send({
        patientId,
        caregiverId: caregiverProfileId,
        addressId,
        startDate: '2026-05-11',
        endDate: '2026-05-11',
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
      });
    const targetVisitId = create.body.visits[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/caregiver/bookings/${create.body.id}/accept`)
      .set(bearer(caregiverToken))
      .send({});

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/customer/bookings/${create.body.id}/reschedule`)
      .set(bearer(customerToken))
      .send({
        visitId: targetVisitId,
        newDate: '2026-05-12',
        timeWindowStart: '10:00',
        timeWindowEnd: '12:00',
      });
    expect(res.status).toBe(200);
    expect(res.body.rescheduledFromId).toBe(targetVisitId);

    const original = await prisma.visit.findUniqueOrThrow({ where: { id: targetVisitId } });
    expect(original.status).toBe('CANCELLED');
  });

  it('raises an SOS that becomes a CRITICAL incident and alerts admins (FR-C14)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customer/emergency-contacts')
      .set(bearer(customerToken))
      .send({ name: 'Next of Kin', phone: '+923001112233' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/sos')
      .set(bearer(customerToken))
      .send({ visitId, note: 'Patient collapsed' });
    expect(res.status).toBe(201);
    expect(res.body.incident.priority).toBe('CRITICAL');
    expect(res.body.incident.source).toBe('SOS');
    expect(res.body.notifiedContacts).toBeGreaterThanOrEqual(1);

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/safety-incidents?status=OPEN')
      .set(bearer(adminToken));
    expect(adminList.status).toBe(200);
    const ids = (adminList.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(res.body.incident.id);
  });
});
