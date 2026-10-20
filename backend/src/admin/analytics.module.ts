import {
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsEnum, IsOptional } from 'class-validator';
import {
  BookingStatus,
  PaymentStatus,
  PayoutStatus,
  UserRole,
  VerificationStatus,
} from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class AnalyticsRangeDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d', 'all'], default: '30d' })
  @IsOptional()
  @IsEnum(['7d', '30d', '90d', 'all'])
  range?: '7d' | '30d' | '90d' | 'all';
}

export class ReportExportDto {
  @ApiPropertyOptional({ enum: ['payments', 'payouts', 'bookings', 'caregivers'] })
  @IsEnum(['payments', 'payouts', 'bookings', 'caregivers'])
  type!: 'payments' | 'payouts' | 'bookings' | 'caregivers';

  @ApiPropertyOptional({ enum: ['csv'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv'])
  format?: 'csv';
}

function rangeStart(range: AnalyticsRangeDto['range']): Date | null {
  if (!range || range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') return JSON.stringify(cell);
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean' || typeof cell === 'bigint') {
    return cell.toString();
  }
  return JSON.stringify(cell) ?? '';
}

/** Escape a value for CSV and join a row. */
export function toCsv(rows: Array<Array<unknown>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cellToString(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** FR-A5: platform-wide operational and financial metrics. */
  async overview(range?: AnalyticsRangeDto['range']) {
    const since = rangeStart(range);
    const dateFilter = since ? { gte: since } : {};
    const bookingDateFilter = since ? { createdAt: { gte: since } } : {};

    const [
      bookingsTotal,
      bookingsByStatus,
      cancelledCount,
      activeCaregivers,
      pendingVerifications,
      revenueAgg,
      commissionAgg,
      payoutAgg,
      visitsCompleted,
    ] = await Promise.all([
      this.prisma.booking.count({ where: bookingDateFilter }),
      this.prisma.booking.groupBy({ by: ['status'], where: bookingDateFilter, _count: { _all: true } }),
      this.prisma.booking.count({
        where: { ...bookingDateFilter, status: BookingStatus.CANCELLED },
      }),
      this.prisma.caregiverProfile.count({
        where: { verificationStatus: VerificationStatus.APPROVED },
      }),
      this.prisma.caregiverProfile.count({
        where: { verificationStatus: VerificationStatus.PENDING },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID, createdAt: dateFilter },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID, createdAt: dateFilter },
        _sum: { commissionAmount: true },
      }),
      this.prisma.payoutRequest.aggregate({
        where: { status: PayoutStatus.PAID, requestedAt: dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.visit.count({ where: { status: 'COMPLETED', createdAt: dateFilter } }),
    ]);

    const cancellationRate = bookingsTotal === 0 ? 0 : cancelledCount / bookingsTotal;

    return {
      range: range ?? '30d',
      bookings: {
        total: bookingsTotal,
        byStatus: Object.fromEntries(
          bookingsByStatus.map((b) => [b.status, b._count._all]),
        ),
        cancellationRate: Number(cancellationRate.toFixed(4)),
      },
      caregivers: {
        active: activeCaregivers,
        pendingVerification: pendingVerifications,
      },
      payments: {
        paidCount: revenueAgg._count._all,
        grossRevenue: revenueAgg._sum.amount ?? 0,
        commissionRevenue: commissionAgg._sum.commissionAmount ?? 0,
      },
      payouts: {
        paidOut: payoutAgg._sum.amount ?? 0,
      },
      visits: {
        completed: visitsCompleted,
      },
    };
  }

  /** FR-A9: generate a CSV report for a given dataset. */
  async export(type: ReportExportDto['type']): Promise<string> {
    switch (type) {
      case 'payments': {
        const payments = await this.prisma.payment.findMany({
          orderBy: { createdAt: 'desc' },
          include: { visit: { select: { bookingId: true } } },
        });
        return toCsv([
          ['id', 'visitId', 'method', 'status', 'amount', 'commissionAmount', 'caregiverAmount', 'paidAt', 'createdAt'],
          ...payments.map((p) => [
            p.id,
            p.visitId,
            p.method,
            p.status,
            p.amount,
            p.commissionAmount,
            p.caregiverAmount,
            p.paidAt?.toISOString() ?? '',
            p.createdAt.toISOString(),
          ]),
        ]);
      }
      case 'payouts': {
        const payouts = await this.prisma.payoutRequest.findMany({
          orderBy: { requestedAt: 'desc' },
        });
        return toCsv([
          ['id', 'caregiverId', 'payoutAccountId', 'amount', 'status', 'requestedAt', 'processedAt'],
          ...payouts.map((p) => [
            p.id,
            p.caregiverId,
            p.payoutAccountId,
            p.amount,
            p.status,
            p.requestedAt.toISOString(),
            p.processedAt?.toISOString() ?? '',
          ]),
        ]);
      }
      case 'bookings': {
        const bookings = await this.prisma.booking.findMany({
          orderBy: { createdAt: 'desc' },
        });
        return toCsv([
          ['id', 'customerId', 'caregiverId', 'serviceType', 'status', 'rateSnapshot', 'discountAmount', 'startDate', 'endDate'],
          ...bookings.map((b) => [
            b.id,
            b.customerId,
            b.caregiverId,
            b.serviceType,
            b.status,
            b.rateSnapshot,
            b.discountAmount,
            b.startDate.toISOString().slice(0, 10),
            b.endDate.toISOString().slice(0, 10),
          ]),
        ]);
      }
      case 'caregivers': {
        const caregivers = await this.prisma.caregiverProfile.findMany({
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { fullName: true, phone: true, status: true } } },
        });
        return toCsv([
          ['id', 'fullName', 'phone', 'specialty', 'verificationStatus', 'ratePerVisit', 'ratingAverage', 'ratingCount', 'createdAt'],
          ...caregivers.map((c) => [
            c.id,
            c.user.fullName,
            c.user.phone,
            c.specialty,
            c.verificationStatus,
            c.ratePerVisit,
            c.ratingAverage,
            c.ratingCount,
            c.createdAt.toISOString(),
          ]),
        ]);
      }
    }
  }
}

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  overview(@Query() query: AnalyticsRangeDto) {
    return this.analytics.overview(query.range);
  }

  @Get('reports/export')
  @Header('Content-Type', 'text/csv')
  async export(@Query() query: ReportExportDto, @Res() res: Response) {
    const csv = await this.analytics.export(query.type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${query.type}-report.csv"`);
    res.send(csv);
  }
}

@Module({
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AdminAnalyticsModule {}
