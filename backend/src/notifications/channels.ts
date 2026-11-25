import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationChannel, UserRole } from '../generated/prisma/client.js';
import { EmailService } from '../email/email.service.js';
import { renderNotificationEmail, WEB_URL } from '../email/templates.js';
import { eventDefinition } from './events.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

/**
 * Channel adapters (TRD §6.7). Each adapter knows how to deliver one
 * notification over one transport. Vendors for WhatsApp/push are still TBD, so
 * the dev adapters log the payload; swap the implementation without touching
 * `NotificationsService`.
 */
export interface ChannelDelivery {
  phone?: string | null;
  email?: string | null;
  title?: string;
  message?: string;
  event: string;
  payload?: Record<string, unknown> | null;
  role?: UserRole | null;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  /** Whether the adapter is configured/available. */
  enabled(): boolean;
  send(delivery: ChannelDelivery): Promise<void>;
}

@Injectable()
export class SmsChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.SMS;
  private readonly logger = new Logger(SmsChannelAdapter.name);

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    this.logger.log(`[DEV-SMS] ${delivery.phone}: ${delivery.message ?? delivery.event}`);
  }
}

@Injectable()
export class WhatsAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppChannelAdapter.name);

  enabled(): boolean {
    return false;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    this.logger.log(`[DEV-WHATSAPP] ${delivery.phone}: ${delivery.message ?? delivery.event}`);
  }
}

@Injectable()
export class PushChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushChannelAdapter.name);

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    // In-app push is persisted by NotificationsService; nothing to dispatch in dev.
    this.logger.debug(`[PUSH] ${delivery.event}`);
  }
}

/** SOS events are safety-critical regardless of which role receives them. */
const CRITICAL_EVENTS = new Set(['safety_incident.sos', 'safety_incident.sos.contact']);

/** Critical events bypass per-channel notification preferences: safety alerts are never opted out of. */
export function isCriticalNotificationEvent(event: string): boolean {
  return CRITICAL_EVENTS.has(event);
}

/** Admin-only catalogue events read as action items rather than routine updates. */
function emailVariant(event: string): 'standard' | 'admin' | 'critical' {
  if (CRITICAL_EVENTS.has(event)) {
    return 'critical';
  }
  if (eventDefinition(event)?.audience.includes(UserRole.ADMIN)) {
    return 'admin';
  }
  return 'standard';
}

function formatSpecialty(specialty?: string | null): string {
  if (!specialty) return 'Care Service';
  switch (specialty) {
    case 'NURSING':
      return 'Nursing Care';
    case 'PHYSIOTHERAPY':
      return 'Physiotherapy';
    case 'POST_SURGERY_CARE':
      return 'Post-Surgery Care';
    case 'ELDERLY_CARE':
      return 'Elderly Care';
    case 'DOCTOR':
      return 'Doctor Visit';
    default:
      return specialty
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

@Injectable()
export class EmailChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailChannelAdapter.name);

  constructor(
    private readonly emailService: EmailService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.email) {
      return;
    }
    const title = delivery.title ?? 'CareSaath Notification';
    let factsRows: Array<[string, string | null | undefined]> | undefined;
    let action: { label: string; url: string } | undefined;

    if (this.prisma && delivery.payload) {
      try {
        const enriched = await this.enrichContext(delivery);
        factsRows = enriched.facts;
        action = enriched.action;
      } catch (error) {
        this.logger.debug(
          `Could not enrich email context for "${delivery.event}": ${(error as Error).message}`,
        );
      }
    }

    const html = renderNotificationEmail({
      title,
      message: delivery.message,
      variant: emailVariant(delivery.event),
      facts: factsRows,
      action,
    });
    try {
      await this.emailService.sendEmail(delivery.email, title, html);
    } catch (error) {
      this.logger.warn(`Failed to email ${delivery.email} for "${delivery.event}": ${(error as Error).message}`);
      throw error;
    }
  }

  private async enrichContext(delivery: ChannelDelivery): Promise<{
    facts?: Array<[string, string | null | undefined]>;
    action?: { label: string; url: string };
  }> {
    if (!this.prisma || !delivery.payload) {
      return {};
    }

    const payload = delivery.payload;

    // 1. Visit events
    if (typeof payload['visitId'] === 'string') {
      const visitId = payload['visitId'];
      const visit = await this.prisma.visit.findUnique({
        where: { id: visitId },
        include: {
          booking: {
            include: {
              patient: { select: { name: true, relationship: true } },
              address: { select: { addressLine: true, city: true } },
              caregiver: { include: { user: { select: { fullName: true } } } },
              customer: { select: { fullName: true } },
            },
          },
        },
      });

      if (visit) {
        const isCaregiver = delivery.role === UserRole.CAREGIVER;
        const location = [visit.booking.address?.addressLine, visit.booking.address?.city].filter(Boolean).join(', ');
        const schedule = `${formatDate(visit.scheduledDate)}${
          visit.timeWindowStart && visit.timeWindowEnd ? ` · ${visit.timeWindowStart} – ${visit.timeWindowEnd}` : ''
        }`;
        const statusLabel = visit.status
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');

        const facts: Array<[string, string | null | undefined]> = [
          ['Service', formatSpecialty(visit.booking.serviceType)],
          ['Visit Status', statusLabel],
          ['Patient', visit.booking.patient?.name],
          isCaregiver
            ? ['Customer', visit.booking.customer?.fullName]
            : ['Caregiver', visit.booking.caregiver?.user?.fullName ?? 'Assigned Professional'],
          ['Scheduled Slot', schedule],
          ['Location', location || null],
        ];

        const actionUrl = isCaregiver
          ? `${WEB_URL}/caregiver/visits/${visit.id}`
          : `${WEB_URL}/customer/visits/${visit.id}`;
        const actionLabel = isCaregiver ? 'Open Visit Details' : 'Track Visit Status';

        return { facts, action: { label: actionLabel, url: actionUrl } };
      }
    }

    // 2. Booking events
    if (typeof payload['bookingId'] === 'string') {
      const bookingId = payload['bookingId'];
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          patient: { select: { name: true, relationship: true } },
          address: { select: { addressLine: true, city: true } },
          caregiver: { include: { user: { select: { fullName: true } } } },
          customer: { select: { fullName: true } },
        },
      });

      if (booking) {
        const isCaregiver = delivery.role === UserRole.CAREGIVER;
        const location = [booking.address?.addressLine, booking.address?.city].filter(Boolean).join(', ');
        const totalAmount = booking.rateSnapshot
          ? `Rs ${Math.max(0, (booking.rateSnapshot - (booking.discountAmount ?? 0)) / 100).toLocaleString()}`
          : null;
        const schedule = `${formatDate(booking.startDate)}${
          booking.timeWindowStart && booking.timeWindowEnd ? ` · ${booking.timeWindowStart} – ${booking.timeWindowEnd}` : ''
        }`;

        const facts: Array<[string, string | null | undefined]> = [
          ['Service', formatSpecialty(booking.serviceType)],
          [
            'Patient',
            booking.patient?.name
              ? `${booking.patient.name}${booking.patient.relationship ? ` (${booking.patient.relationship})` : ''}`
              : null,
          ],
          isCaregiver
            ? ['Customer', booking.customer?.fullName]
            : ['Caregiver', booking.caregiver?.user?.fullName ?? 'Assigned Professional'],
          ['Schedule', schedule],
          ['Location', location || null],
          ['Total Amount', totalAmount],
        ];

        let actionUrl = `${WEB_URL}/customer/bookings/${booking.id}`;
        let actionLabel = 'View Booking Details';
        if (isCaregiver) {
          actionUrl = `${WEB_URL}/caregiver/requests`;
          actionLabel = delivery.event === 'booking.requested' ? 'Review Booking Request' : 'View Booking Details';
        } else if (delivery.role === UserRole.ADMIN) {
          actionUrl = `${WEB_URL}/admin/bookings`;
          actionLabel = 'View in Admin Console';
        }

        return { facts, action: { label: actionLabel, url: actionUrl } };
      }
    }

    // 3. Payment events
    if (delivery.event.startsWith('payment.')) {
      const rawAmount =
        typeof payload['amount'] === 'number' || typeof payload['amount'] === 'string'
          ? Number(payload['amount'])
          : NaN;
      const amount = Number.isFinite(rawAmount)
        ? `Rs ${(rawAmount / 100).toLocaleString()}`
        : null;
      const facts: Array<[string, string | null | undefined]> = [
        ['Amount', amount],
        ['Status', delivery.title ?? 'Payment Update'],
      ];
      const isCaregiver = delivery.role === UserRole.CAREGIVER;
      return {
        facts,
        action: {
          label: isCaregiver ? 'View Earnings & Payouts' : 'View Payment Details',
          url: isCaregiver ? `${WEB_URL}/caregiver/earnings` : `${WEB_URL}/customer/account/payments`,
        },
      };
    }

    // 4. Payout events
    if (delivery.event.startsWith('payout.')) {
      const rawAmount =
        typeof payload['amount'] === 'number' || typeof payload['amount'] === 'string'
          ? Number(payload['amount'])
          : NaN;
      const amount = Number.isFinite(rawAmount)
        ? `Rs ${(rawAmount / 100).toLocaleString()}`
        : null;
      return {
        facts: amount ? [['Amount', amount]] : undefined,
        action: {
          label: delivery.role === UserRole.ADMIN ? 'Review Payouts' : 'View Earnings & Payouts',
          url: delivery.role === UserRole.ADMIN ? `${WEB_URL}/admin/payouts` : `${WEB_URL}/caregiver/earnings`,
        },
      };
    }

    return {};
  }
}
