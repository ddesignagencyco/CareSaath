import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from './feedback.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923001234567' };
const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234568' };

describe('FeedbackService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: FeedbackService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new FeedbackService(prisma as never, createAuditMock() as never);
  });

  it('rejects reviewing a visit that is not completed', async () => {
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      status: 'CHECKED_OUT',
      booking: { caregiverId: 'cg-1' },
    });
    await expect(service.review(customer, 'v-1', { rating: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects reviewing an already reviewed visit', async () => {
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      status: 'COMPLETED',
      booking: { caregiverId: 'cg-1' },
    });
    prisma.review.findUnique.mockResolvedValue({ id: 'r-existing' });
    await expect(service.review(customer, 'v-1', { rating: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates a review and rolls up the caregiver rating', async () => {
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      status: 'COMPLETED',
      booking: { caregiverId: 'cg-1' },
    });
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue({ id: 'r-1', rating: 5 });
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 2 },
    });
    prisma.caregiverProfile.update.mockResolvedValue({});

    const result = await service.review(customer, 'v-1', { rating: 5, comment: 'Great' });

    expect(result).toMatchObject({ id: 'r-1' });
    expect(prisma.caregiverProfile.update).toHaveBeenCalledWith({
      where: { id: 'cg-1' },
      data: { ratingAverage: 4.5, ratingCount: 2 },
    });
  });

  it('rejects a customer complaint for a visit they do not own', async () => {
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(
      service.reportCustomerIncident(customer, 'v-1', { description: 'unsafe' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a customer safety incident', async () => {
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1' });
    prisma.safetyIncident.create.mockResolvedValue({ id: 'inc-1', priority: 'MEDIUM' });
    const result = await service.reportCustomerIncident(customer, 'v-1', {
      description: 'unsafe',
    });
    expect(result).toMatchObject({ id: 'inc-1' });
    expect(prisma.safetyIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'CUSTOMER_COMPLAINT', visitId: 'v-1' }),
      }),
    );
  });

  it('creates a caregiver safety report for an assigned visit', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.visit.findFirst.mockResolvedValue({ id: 'v-1' });
    prisma.safetyIncident.create.mockResolvedValue({ id: 'inc-2', priority: 'HIGH' });
    const result = await service.reportCaregiverIncident(caregiver, 'v-1', {
      description: 'no access',
      priority: 'HIGH' as never,
    });
    expect(result).toMatchObject({ id: 'inc-2' });
    expect(prisma.safetyIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'CAREGIVER_REPORT' }),
      }),
    );
  });
});
