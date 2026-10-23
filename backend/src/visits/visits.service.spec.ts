import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { VisitsService, distanceMeters } from './visits.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  createRedisMock,
  createSmsMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234567' };

function visitFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    bookingId: 'b-1',
    status: 'CONFIRMED',
    note: null,
    booking: {
      customerId: 'u-cust',
      customer: { id: 'u-cust', phone: '+923000000001' },
      patient: { medicalContext: null },
    },
    ...overrides,
  };
}

describe('distanceMeters', () => {
  it('is zero for identical points and ~111 km per degree of latitude', () => {
    expect(distanceMeters(31.5, 74.3, 31.5, 74.3)).toBe(0);
    expect(distanceMeters(31, 74, 32, 74)).toBeGreaterThan(110000);
    expect(distanceMeters(31, 74, 32, 74)).toBeLessThan(112000);
  });
});

describe('VisitsService transitions', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let sms: ReturnType<typeof createSmsMock>;
  let service: VisitsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    notifications = createNotificationsMock();
    redis = createRedisMock();
    sms = createSmsMock();
    wireTransaction(prisma);
    service = new VisitsService(
      prisma as never,
      createAuditMock() as never,
      notifications as never,
      redis as never,
      sms as never,
      { getNumber: () => Promise.resolve(600) } as never,
    );
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
  });

  it('throws when the visit is not assigned to the caregiver', async () => {
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.enRoute(caregiver, 'v-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an illegal transition', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CONFIRMED' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CONFIRMED' }));
    await expect(service.checkOut(caregiver, 'v-1', { lat: 1, lng: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires coordinates for a GPS check-in', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    await expect(service.checkIn(caregiver, 'v-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('moves EN_ROUTE -> CHECKED_IN and notifies the customer', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'CHECKED_IN' });
    prisma.visitStatusHistory.create.mockResolvedValue({});

    const result = await service.checkIn(caregiver, 'v-1', { lat: 31.5, lng: 74.3 });

    expect(result).toMatchObject({ status: 'CHECKED_IN' });
    expect(prisma.visitStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: 'EN_ROUTE', toStatus: 'CHECKED_IN' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cust', event: 'visit.checked_in' }),
    );
  });

  it('refuses a second note on the same visit', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ note: { id: 'note-1' } }));
    await expect(
      service.submitNote(caregiver, 'v-1', { summary: 'done' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('issues a check-in OTP to the customer and stores it in Redis', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.otpCode.create.mockResolvedValue({});

    const result = await service.requestCheckInOtp(caregiver, 'v-1');

    expect(result.sentTo).toBe('+923000000001');
    expect(redis.client.set).toHaveBeenCalled();
    expect(sms.sendOtp).toHaveBeenCalledWith('+923000000001', expect.any(String));
  });

  it('rejects a check-in OTP request on a completed visit', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'COMPLETED' }));
    await expect(service.requestCheckInOtp(caregiver, 'v-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an OTP check-in when no code was requested', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    redis.client.get.mockResolvedValue(null);
    await expect(
      service.checkIn(caregiver, 'v-1', { method: 'OTP', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a matching OTP check-in and consumes the code', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'CHECKED_IN' });
    // sha256('123456')
    const hash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
    redis.client.get.mockResolvedValue(hash);
    redis.client.incr.mockResolvedValue(1);
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.checkIn(caregiver, 'v-1', { method: 'OTP', code: '123456' });

    expect(result).toMatchObject({ status: 'CHECKED_IN' });
    expect(redis.client.del).toHaveBeenCalled();
    expect(prisma.otpCode.updateMany).toHaveBeenCalled();
  });

  it('rejects a GPS check-in outside the geofence', async () => {
    const withAddress = visitFixture({ status: 'EN_ROUTE' });
    (withAddress.booking as Record<string, unknown>)['address'] = { latitude: 31.5, longitude: 74.3 };
    prisma.visit.findFirst.mockResolvedValue(withAddress);
    await expect(
      service.checkIn(caregiver, 'v-1', { lat: 31.6, lng: 74.3 }),
    ).rejects.toThrow(/from the visit address/);
    expect(prisma.visit.update).not.toHaveBeenCalled();
  });

  it('does not burn the check-in OTP when the visit is not EN_ROUTE', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CONFIRMED' }));
    await expect(
      service.checkIn(caregiver, 'v-1', { method: 'OTP', code: '123456' }),
    ).rejects.toThrow('Cannot move visit from CONFIRMED to CHECKED_IN');
    expect(redis.client.get).not.toHaveBeenCalled();
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('requires a valid code for an OTP check-out', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'IN_PROGRESS' }));
    redis.client.get.mockResolvedValue(null);
    await expect(
      service.checkOut(caregiver, 'v-1', { method: 'OTP' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('completes the booking once its last open visit is completed', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'COMPLETED' });
    prisma.visit.count.mockResolvedValue(0);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    await service.submitNote(caregiver, 'v-1', { summary: 'done' });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
  });

  it('keeps the booking open while other visits are still pending', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'COMPLETED' });
    prisma.visit.count.mockResolvedValue(2);

    await service.submitNote(caregiver, 'v-1', { summary: 'done' });

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});
