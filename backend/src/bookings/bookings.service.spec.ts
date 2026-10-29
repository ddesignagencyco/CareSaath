import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { BookingsService } from './bookings.module.js';

const caregiverUser: AuthUser = { sub: 'u-caregiver', role: 'CAREGIVER', phone: '+923000000000' };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    caregiverProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cg-1' }),
      findFirst: vi.fn(),
    },
    patientProfile: { findFirst: vi.fn() },
    address: { findFirst: vi.fn() },
    availabilityRule: { findMany: vi.fn().mockResolvedValue([]) },
    availabilityBlock: { findMany: vi.fn().mockResolvedValue([]) },
    caregiverServiceArea: { findMany: vi.fn().mockResolvedValue([]) },
    booking: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    visit: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    visitStatusHistory: { create: vi.fn() },
    prescriptionDocument: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
    ...overrides,
  };
  const audit = { log: vi.fn() };
  const notifications = { notify: vi.fn() };
  const promos = { quote: vi.fn(), redeem: vi.fn() };
  const storage = { validateUpload: vi.fn(), put: vi.fn(), presignedGet: vi.fn() };
  const config = { getNumber: vi.fn().mockResolvedValue(60) };
  const caregivers = { recordStrike: vi.fn().mockResolvedValue(undefined) };
  const service = new BookingsService(
    prisma as never,
    audit as never,
    notifications as never,
    promos as never,
    storage as never,
    config as never,
    caregivers as never,
  );
  return { service, prisma, audit, notifications, promos, storage, config, caregivers };
}

describe('BookingsService.accept', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when no caregiver profile exists', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.accept(caregiverUser, 'b-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects accepting a booking that is not REQUESTED', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: BookingStatus.CONFIRMED });
    await expect(service.accept(caregiverUser, 'b-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms the booking and its requested visits, then notifies the customer', async () => {
    const { service, prisma, notifications, audit } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.REQUESTED,
      customerId: 'cust-1',
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ booking: { update: vi.fn() }, visit: { updateMany: vi.fn() } }),
    );
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CONFIRMED,
      customerId: 'cust-1',
      caregiverId: 'cg-1',
      prescriptions: [],
    });

    const result = await service.accept(caregiverUser, 'b-1');

    expect(result).toMatchObject({ id: 'b-1', status: BookingStatus.CONFIRMED });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.accepted', entityId: 'b-1' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', event: 'booking.confirmed' }),
    );
  });

  it('rejects accepting when the caregiver already has an active visit elsewhere', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: BookingStatus.REQUESTED });
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-active' });
    await expect(service.accept(caregiverUser, 'b-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('surfaces the count of prior completed visits with this caregiver', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: BookingStatus.REQUESTED, customerId: 'cust-1' });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ booking: { update: vi.fn() }, visit: { updateMany: vi.fn() } }),
    );
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CONFIRMED,
      customerId: 'cust-1',
      caregiverId: 'cg-1',
      prescriptions: [],
    });
    prisma.visit.count.mockResolvedValue(4);

    const result = await service.accept(caregiverUser, 'b-1');

    expect(result).toMatchObject({ priorVisitsWithCaregiver: 4 });
    expect(prisma.visit.count).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETED',
        booking: { customerId: 'cust-1', caregiverId: 'cg-1', id: { not: 'b-1' } },
      },
    });
  });
});

describe('BookingsService.decline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a DECLINED strike on the caregiver', async () => {
    const { service, prisma, caregivers } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: BookingStatus.REQUESTED, customerId: 'cust-1' });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ booking: { update: vi.fn() }, visit: { updateMany: vi.fn() } }),
    );
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.DECLINED,
      customerId: 'cust-1',
      caregiverId: 'cg-1',
      prescriptions: [],
    });

    await service.decline(caregiverUser, 'b-1', {});

    expect(caregivers.recordStrike).toHaveBeenCalledWith('cg-1', 'DECLINED', 'b-1');
  });
});

describe('BookingsService.createCustomerBooking', () => {
  beforeEach(() => vi.clearAllMocks());

  const customer: AuthUser = { sub: 'cust-1', role: 'CUSTOMER', phone: '+923000000001' };
  const baseDto = {
    patientId: 'pat-1',
    caregiverId: 'cg-1',
    addressId: 'addr-1',
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    timeWindowStart: '09:00',
    timeWindowEnd: '11:00',
  };

  function setHappyPath(prisma: ReturnType<typeof makeService>['prisma'], caregiverExtra: Record<string, unknown> = {}) {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pat-1' });
    prisma.address.findFirst.mockResolvedValue({ id: 'addr-1', latitude: 31.5204, longitude: 74.3587 });
    prisma.caregiverProfile.findFirst.mockResolvedValue({
      id: 'cg-1',
      userId: 'u-caregiver',
      specialty: 'NURSING',
      ratePerVisit: 50000,
      currentLat: null,
      currentLng: null,
      ...caregiverExtra,
    });
    prisma.visit.count.mockResolvedValue(0);
    prisma.availabilityRule.findMany.mockResolvedValue([]);
    prisma.availabilityBlock.findMany.mockResolvedValue([]);
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b-1',
      customerId: 'cust-1',
      caregiverId: 'cg-1',
      prescriptions: [],
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        booking: { create: vi.fn().mockResolvedValue({ id: 'b-1' }) },
        visit: { createMany: vi.fn() },
      }),
    );
  }

  it('uses the standard respond window for a normal booking', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma);
    config.getNumber.mockImplementation((key: string) =>
      Promise.resolve(key === 'booking.respondWindowMinutes' ? 60 : 10),
    );

    await service.createCustomerBooking(customer, baseDto);

    expect(config.getNumber).toHaveBeenCalledWith('booking.respondWindowMinutes');
    expect(config.getNumber).not.toHaveBeenCalledWith('booking.immediateMaxDistanceMeters');
  });

  it('rejects an immediate booking when the caregiver has no live location', async () => {
    const { service, prisma } = makeService();
    setHappyPath(prisma);
    await expect(
      service.createCustomerBooking(customer, { ...baseDto, isImmediate: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an immediate booking when the caregiver is too far away', async () => {
    const { service, prisma, config } = makeService();
    // ~11km north of the visit address: well past any sane immediate radius.
    setHappyPath(prisma, { currentLat: 31.62, currentLng: 74.3587 });
    config.getNumber.mockImplementation((key: string) =>
      Promise.resolve(key === 'booking.immediateMaxDistanceMeters' ? 5000 : 10),
    );
    await expect(
      service.createCustomerBooking(customer, { ...baseDto, isImmediate: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an immediate booking from a nearby caregiver, using the shorter window', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma, { currentLat: 31.5204, currentLng: 74.3587 });
    config.getNumber.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'booking.immediateRespondWindowMinutes' ? 10 : key === 'booking.immediateMaxDistanceMeters' ? 5000 : 60,
      ),
    );

    await service.createCustomerBooking(customer, { ...baseDto, isImmediate: true });

    expect(config.getNumber).toHaveBeenCalledWith('booking.immediateRespondWindowMinutes');
  });

  it('rejects a booking on a blacked-out date', async () => {
    const { service, prisma } = makeService();
    setHappyPath(prisma);
    prisma.availabilityBlock.findMany.mockResolvedValue([
      { startDate: new Date('2026-11-01T00:00:00.000Z'), endDate: new Date('2026-11-03T00:00:00.000Z') },
    ]);
    await expect(service.createCustomerBooking(customer, baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a booking outside the caregiver\'s weekly availability', async () => {
    const { service, prisma } = makeService();
    setHappyPath(prisma);
    // 2026-11-01 is a Sunday (dayOfWeek 0); the caregiver only set up Monday hours.
    prisma.availabilityRule.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    ]);
    await expect(service.createCustomerBooking(customer, baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a booking that falls within the caregiver\'s weekly availability', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma);
    config.getNumber.mockResolvedValue(60);
    prisma.availabilityRule.findMany.mockResolvedValue([
      { dayOfWeek: 0, startTime: '08:00', endTime: '18:00' },
    ]);
    await expect(service.createCustomerBooking(customer, baseDto)).resolves.toBeDefined();
  });

  it('does not restrict booking when the caregiver has no availability rules at all', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma);
    config.getNumber.mockResolvedValue(60);
    await expect(service.createCustomerBooking(customer, baseDto)).resolves.toBeDefined();
  });

  it('rejects a booking when the caregiver has zones in that city but none cover the address', async () => {
    const { service, prisma } = makeService();
    setHappyPath(prisma);
    prisma.address.findFirst.mockResolvedValue({
      id: 'addr-1',
      city: 'Lahore',
      latitude: 31.5204,
      longitude: 74.3587,
    });
    prisma.caregiverServiceArea.findMany.mockResolvedValue([
      { latitude: 31.62, longitude: 74.3587, radiusMeters: 2000 }, // ~11km away
    ]);
    await expect(service.createCustomerBooking(customer, baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a booking within a defined zone\'s radius', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma);
    config.getNumber.mockResolvedValue(60);
    prisma.address.findFirst.mockResolvedValue({
      id: 'addr-1',
      city: 'Lahore',
      latitude: 31.5204,
      longitude: 74.3587,
    });
    prisma.caregiverServiceArea.findMany.mockResolvedValue([
      { latitude: 31.5204, longitude: 74.3587, radiusMeters: 2000 },
    ]);
    await expect(service.createCustomerBooking(customer, baseDto)).resolves.toBeDefined();
  });

  it('does not restrict booking when the caregiver has no zones defined for that city', async () => {
    const { service, prisma, config } = makeService();
    setHappyPath(prisma);
    config.getNumber.mockResolvedValue(60);
    prisma.address.findFirst.mockResolvedValue({
      id: 'addr-1',
      city: 'Lahore',
      latitude: 31.5204,
      longitude: 74.3587,
    });
    prisma.caregiverServiceArea.findMany.mockResolvedValue([]);
    await expect(service.createCustomerBooking(customer, baseDto)).resolves.toBeDefined();
  });

  it('rejects an immediate recurring booking before touching the database', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.createCustomerBooking(customer, {
        ...baseDto,
        type: 'RECURRING' as never,
        weekdays: [1, 3],
        isImmediate: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patientProfile.findFirst).not.toHaveBeenCalled();
  });
});

describe('BookingsService.reschedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels the original visit and creates a linked replacement', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CONFIRMED,
      customerId: 'cust-1',
      caregiver: { id: 'cg-1', userId: 'u-caregiver' },
    });
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1', status: 'CONFIRMED' });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        visit: {
          update: vi.fn().mockResolvedValue({ id: 'v-1', status: 'CANCELLED' }),
          create: vi.fn().mockResolvedValue({ id: 'v-2', status: 'CONFIRMED', rescheduledFromId: 'v-1' }),
        },
        visitStatusHistory: { create: vi.fn() },
      }),
    );

    const result = await service.rescheduleCustomer(caregiverUser, 'b-1', {
      visitId: 'v-1',
      newDate: '2026-03-01',
      timeWindowStart: '09:00',
      timeWindowEnd: '11:00',
    });

    expect(result).toMatchObject({ id: 'v-2', rescheduledFromId: 'v-1' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'visit.rescheduled' }),
    );
  });

  it('rejects rescheduling an in-progress visit', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CONFIRMED,
      customerId: 'cust-1',
      caregiver: { id: 'cg-1', userId: 'u-caregiver' },
    });
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1', status: 'IN_PROGRESS' });
    await expect(
      service.rescheduleCustomer(caregiverUser, 'b-1', {
        visitId: 'v-1',
        newDate: '2026-03-01',
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BookingsService.uploadPrescription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the file and records the document (FR-C5)', async () => {
    const { service, prisma, storage } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CONFIRMED,
      caregiver: { userId: 'u-caregiver' },
    });
    storage.put.mockResolvedValue({ fileKey: 'bookings/b-1/prescriptions/x.pdf', mimeType: 'application/pdf', sizeBytes: 12 });
    prisma.prescriptionDocument.create.mockResolvedValue({
      id: 'doc-1',
      bookingId: 'b-1',
      mimeType: 'application/pdf',
      sizeBytes: 12,
      createdAt: new Date(),
    });

    const result = await service.uploadPrescription(caregiverUser, 'b-1', {
      originalname: 'rx.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });

    expect(result).toMatchObject({ id: 'doc-1', bookingId: 'b-1' });
    expect(storage.validateUpload).toHaveBeenCalledWith('application/pdf', 4);
  });

  it('rejects uploads on a cancelled booking', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.CANCELLED,
      caregiver: { userId: 'u-caregiver' },
    });
    await expect(
      service.uploadPrescription(caregiverUser, 'b-1', {
        originalname: 'rx.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
