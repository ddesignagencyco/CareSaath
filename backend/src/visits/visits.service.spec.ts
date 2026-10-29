import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      { recordStrike: vi.fn().mockResolvedValue(undefined) } as never,
    );
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
  });

  it('strips the customer phone from the caregiver-facing visit response', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture());
    const result = await service.getCaregiver(caregiver, 'v-1');
    expect(result.booking.customer).toEqual({ id: 'u-cust' });
    expect(result.booking.customer).not.toHaveProperty('phone');
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
    prisma.payment.findMany.mockResolvedValue([{ status: 'PAID', method: 'CASH' }]);

    await service.submitNote(caregiver, 'v-1', { summary: 'done' });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
  });

  describe('late-arrival strikes', () => {
    function makeLateCheckFixture(scheduledDate: Date, timeWindowStart: string) {
      return visitFixture({
        status: 'EN_ROUTE',
        scheduledDate,
        timeWindowStart,
        booking: {
          customerId: 'u-cust',
          customer: { id: 'u-cust', phone: '+923000000001' },
          patient: { medicalContext: null },
          caregiver: { id: 'cg-1' },
        },
      });
    }

    it('does not strike a caregiver who checks in within the grace period', async () => {
      const caregivers = { recordStrike: vi.fn().mockResolvedValue(undefined) };
      const graceService = new VisitsService(
        prisma as never,
        createAuditMock() as never,
        notifications as never,
        redis as never,
        sms as never,
        { getNumber: (key: string) => Promise.resolve(key === 'visit.lateArrivalGraceMinutes' ? 15 : 0) } as never,
        caregivers as never,
      );
      const now = new Date();
      // Scheduled start == this instant's own hour:minute, so "now" is always on time.
      const timeWindowStart = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
      const fixture = makeLateCheckFixture(now, timeWindowStart);
      prisma.visit.findFirst.mockResolvedValue(fixture);
      prisma.visit.findUnique.mockResolvedValue(fixture);
      prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'CHECKED_IN' });

      await graceService.checkIn(caregiver, 'v-1', { lat: 31.5, lng: 74.3 });

      expect(caregivers.recordStrike).not.toHaveBeenCalled();
    });

    it('records a LATE_ARRIVAL strike when check-in is well past the window + grace', async () => {
      const caregivers = { recordStrike: vi.fn().mockResolvedValue(undefined) };
      const lateService = new VisitsService(
        prisma as never,
        createAuditMock() as never,
        notifications as never,
        redis as never,
        sms as never,
        { getNumber: (key: string) => Promise.resolve(key === 'visit.lateArrivalGraceMinutes' ? 15 : 0) } as never,
        caregivers as never,
      );
      // Scheduled for two hours before "now", so check-in is far past the 15-minute grace.
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const fixture = makeLateCheckFixture(
        twoHoursAgo,
        `${twoHoursAgo.getUTCHours().toString().padStart(2, '0')}:00`,
      );
      prisma.visit.findFirst.mockResolvedValue(fixture);
      prisma.visit.findUnique.mockResolvedValue(fixture);
      prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'CHECKED_IN' });

      await lateService.checkIn(caregiver, 'v-1', { lat: 31.5, lng: 74.3 });

      expect(caregivers.recordStrike).toHaveBeenCalledWith('cg-1', 'LATE_ARRIVAL', 'b-1');
    });
  });

  describe('payment gate on completion', () => {
    const completable = () => {
      prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
      prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
      prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'COMPLETED' });
      prisma.visit.count.mockResolvedValue(1);
    };

    it('blocks completion when no payment exists', async () => {
      completable();
      prisma.payment.findMany.mockResolvedValue([]);
      await expect(service.submitNote(caregiver, 'v-1', { summary: 'done' })).rejects.toThrow(
        /no payment has been made/,
      );
      expect(prisma.visit.update).not.toHaveBeenCalled();
      expect(prisma.visitNote.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ customerConfirmedAt: null, caregiverConfirmedAt: null }, /neither the customer nor the caregiver/],
      [{ customerConfirmedAt: new Date(), caregiverConfirmedAt: null }, /caregiver has not confirmed receiving/],
      [{ customerConfirmedAt: null, caregiverConfirmedAt: new Date() }, /customer has not confirmed handing over/],
    ])('blocks completion while cash is only confirmed by one side', async (confirmations, message) => {
      completable();
      prisma.payment.findMany.mockResolvedValue([{ status: 'PENDING', method: 'CASH', ...confirmations }]);
      await expect(service.submitNote(caregiver, 'v-1', { summary: 'done' })).rejects.toThrow(message);
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });

    it('blocks completion while a card payment is unsettled', async () => {
      completable();
      prisma.payment.findMany.mockResolvedValue([{ status: 'PENDING', method: 'CARD' }]);
      await expect(service.submitNote(caregiver, 'v-1', { summary: 'done' })).rejects.toThrow(
        /card payment has not been completed/,
      );
    });

    it('allows completion once the payment is PAID', async () => {
      completable();
      prisma.payment.findMany.mockResolvedValue([{ status: 'PAID', method: 'CASH' }]);
      await expect(service.submitNote(caregiver, 'v-1', { summary: 'done' })).resolves.toBeDefined();
    });

    it('can be switched off with visit.requirePaymentBeforeComplete = 0', async () => {
      completable();
      const lenient = new VisitsService(
        prisma as never,
        createAuditMock() as never,
        notifications as never,
        redis as never,
        sms as never,
        { getNumber: () => Promise.resolve(0) } as never,
        { recordStrike: vi.fn().mockResolvedValue(undefined) } as never,
      );
      await expect(lenient.submitNote(caregiver, 'v-1', { summary: 'done' })).resolves.toBeDefined();
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
    });
  });

  it('keeps the booking open while other visits are still pending', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CHECKED_OUT' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'COMPLETED' });
    prisma.visit.count.mockResolvedValue(2);
    prisma.payment.findMany.mockResolvedValue([{ status: 'PAID', method: 'CARD' }]);

    await service.submitNote(caregiver, 'v-1', { summary: 'done' });

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});
