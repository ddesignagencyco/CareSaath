import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { BookingStatus, VisitStatus } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

const DEFAULT_INTERVAL_MINUTES = 5;

export interface BookingExpiryResult {
  expired: number;
}

/**
 * Enforces Booking.respondBy (immediate or scheduled): a caregiver who never
 * accepts/declines before the deadline has the request auto-declined so the
 * customer isn't left waiting indefinitely, and can rebook with someone else.
 */
@Injectable()
export class BookingExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  onModuleInit(): void {
    const minutes = Number(process.env['BOOKING_EXPIRY_INTERVAL_MINUTES'] ?? DEFAULT_INTERVAL_MINUTES);
    const intervalMs = Math.max(1, minutes) * 60 * 1000;
    this.timer = setInterval(() => {
      void this.run();
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`Booking expiry sweep scheduled every ${minutes} minute(s)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Run one sweep pass. Returns the count; safe to call directly (e.g. tests). */
  async run(now = new Date()): Promise<BookingExpiryResult> {
    const expired = await this.prisma.booking.findMany({
      where: { status: BookingStatus.REQUESTED, respondBy: { lt: now } },
      select: {
        id: true,
        customerId: true,
        caregiverId: true,
        promoCodeId: true,
        caregiver: { select: { userId: true } },
      },
    });
    for (const booking of expired) {
      // Decline only if the booking is STILL requested. Guarding on status (an atomic
      // updateMany, not a blind update) prevents the sweep from clobbering a booking the
      // caregiver accepted in the instant between the read above and this write.
      const declined = await this.prisma.$transaction(async (tx) => {
        const res = await tx.booking.updateMany({
          where: { id: booking.id, status: BookingStatus.REQUESTED },
          data: {
            status: BookingStatus.DECLINED,
            cancelledAt: now,
            cancelReason: 'Expired: the caregiver did not respond in time',
          },
        });
        if (res?.count === 0) {
          return false;
        }
        await tx.visit.updateMany({
          where: { bookingId: booking.id, status: { in: [VisitStatus.REQUESTED, VisitStatus.CONFIRMED] } },
          data: { status: VisitStatus.DECLINED },
        });
        // No visit will happen, so give the one-time promo redemption back.
        if (booking.promoCodeId) {
          await tx.promoCode.updateMany({
            where: { id: booking.promoCodeId, usesCount: { gt: 0 } },
            data: { usesCount: { decrement: 1 } },
          });
        }
        return true;
      });
      if (!declined) {
        continue;
      }
      await this.audit.log({
        actorId: null,
        action: 'booking.expired',
        entityType: 'Booking',
        entityId: booking.id,
      });
      await this.notifications.notify({
        userId: booking.customerId,
        event: 'booking.declined',
        payload: { bookingId: booking.id },
        message: 'Your booking request expired because the caregiver did not respond in time.',
      });
      this.realtime?.entityUpdated(
        { users: [booking.customerId, booking.caregiver.userId] },
        { type: 'booking', id: booking.id, action: 'expired', status: BookingStatus.DECLINED },
      );
    }
    if (expired.length > 0) {
      this.logger.log(`Booking expiry sweep: ${expired.length} booking(s) auto-declined`);
    }
    return { expired: expired.length };
  }
}

@Module({
  imports: [NotificationsModule],
  providers: [BookingExpiryService],
  exports: [BookingExpiryService],
})
export class BookingExpiryModule {}
