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
    },
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
  const service = new BookingsService(
    prisma as never,
    audit as never,
    notifications as never,
    promos as never,
    storage as never,
  );
  return { service, prisma, audit, notifications, promos, storage };
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
    prisma.booking.findUnique.mockResolvedValue({ id: 'b-1', status: BookingStatus.CONFIRMED });

    const result = await service.accept(caregiverUser, 'b-1');

    expect(result).toMatchObject({ id: 'b-1', status: BookingStatus.CONFIRMED });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.accepted', entityId: 'b-1' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', event: 'booking.confirmed' }),
    );
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
