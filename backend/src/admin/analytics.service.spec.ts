import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsService, toCsv } from './analytics.module.js';
import { createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

describe('toCsv', () => {
  it('joins rows with commas and headers', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('a,b\n1,2');
  });

  it('quotes values containing commas or quotes', () => {
    expect(toCsv([['hello, world', 'say "hi"']])).toBe('"hello, world","say ""hi"""');
  });

  it('renders empty cells for null and undefined', () => {
    expect(toCsv([['x', null, undefined, 'y']])).toBe('x,,,y');
  });
});

describe('AnalyticsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new AnalyticsService(prisma as never);
  });

  it('computes the overview metrics and cancellation rate', async () => {
    prisma.booking.count.mockResolvedValue(10);
    prisma.booking.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 6 } },
      { status: 'CANCELLED', _count: { _all: 2 } },
      { status: 'REQUESTED', _count: { _all: 2 } },
    ]);
    prisma.booking.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2);
    prisma.caregiverProfile.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 90000 }, _count: { _all: 9 } })
      .mockResolvedValueOnce({ _sum: { commissionAmount: 18000 } });
    prisma.payoutRequest.aggregate.mockResolvedValue({ _sum: { amount: 40000 } });
    prisma.visit.count.mockResolvedValue(8);

    const result = await service.overview('30d');

    expect(result.bookings.total).toBe(10);
    expect(result.bookings.byStatus.CONFIRMED).toBe(6);
    expect(result.bookings.cancellationRate).toBe(0.2);
    expect(result.caregivers).toEqual({ active: 7, pendingVerification: 3 });
    expect(result.payments).toEqual({
      paidCount: 9,
      grossRevenue: 90000,
      commissionRevenue: 18000,
    });
    expect(result.payouts.paidOut).toBe(40000);
    expect(result.visits.completed).toBe(8);
  });

  it('reports a zero cancellation rate with no bookings', async () => {
    prisma.booking.count.mockResolvedValue(0);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.caregiverProfile.count.mockResolvedValue(0);
    prisma.payment.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
    prisma.payoutRequest.aggregate.mockResolvedValue({ _sum: {} });
    prisma.visit.count.mockResolvedValue(0);

    const result = await service.overview('all');
    expect(result.bookings.cancellationRate).toBe(0);
    expect(result.payments.grossRevenue).toBe(0);
  });

  it('exports payments as CSV with a header row', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        visitId: 'v-1',
        method: 'CASH',
        status: 'PAID',
        amount: 5000,
        commissionAmount: 750,
        caregiverAmount: 4250,
        paidAt: new Date('2026-03-02T10:00:00.000Z'),
        createdAt: new Date('2026-03-02T09:00:00.000Z'),
        visit: { bookingId: 'b-1' },
      },
    ]);
    const csv = await service.export('payments');
    const [header, row] = csv.split('\n');
    expect(header).toContain('id,visitId,method,status');
    expect(row).toContain('pay-1,v-1,CASH,PAID,5000');
  });

  it('exports caregivers with masked-free operational columns', async () => {
    prisma.caregiverProfile.findMany.mockResolvedValue([
      {
        id: 'cg-1',
        specialty: 'NURSING',
        verificationStatus: 'APPROVED',
        ratePerVisit: 5000,
        ratingAverage: 4.5,
        ratingCount: 3,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        user: { fullName: 'Ali', phone: '+92300', status: 'ACTIVE' },
      },
    ]);
    const csv = await service.export('caregivers');
    expect(csv.split('\n')[0]).toContain('fullName,phone,specialty');
    expect(csv).toContain('Ali');
  });
});
