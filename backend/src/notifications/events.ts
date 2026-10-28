import { UserRole } from '../generated/prisma/client.js';

export interface NotificationEventDefinition {
  /** Roles this event may be delivered to. A recipient with any other role never gets it. */
  audience: UserRole[];
  /** Short heading shown above the message in the in-app feed. */
  title: string;
}

const CUSTOMER = [UserRole.CUSTOMER];
const CAREGIVER = [UserRole.CAREGIVER];
const ADMIN = [UserRole.ADMIN];
const CUSTOMER_OR_CAREGIVER = [UserRole.CUSTOMER, UserRole.CAREGIVER];

/**
 * The notification catalogue. Every notification the API sends is declared
 * here with the role(s) it is for; `NotificationsService.notify` refuses to
 * deliver an event to a recipient whose role is not listed, so feeds can never
 * mix roles even if a call site targets the wrong user.
 */
export const NOTIFICATION_EVENTS: Record<string, NotificationEventDefinition> = {
  // ---- Bookings & visits: customer-facing status changes
  'booking.confirmed': { audience: CUSTOMER, title: 'Booking accepted' },
  'booking.declined': { audience: CUSTOMER, title: 'Booking declined' },
  'visit.confirmed': { audience: CUSTOMER, title: 'Visit confirmed' },
  'visit.en_route': { audience: CUSTOMER, title: 'Caregiver is on the way' },
  'visit.checked_in': { audience: CUSTOMER, title: 'Caregiver has arrived' },
  'visit.in_progress': { audience: CUSTOMER, title: 'Visit in progress' },
  'visit.checked_out': { audience: CUSTOMER, title: 'Visit finished' },
  'visit.completed': { audience: CUSTOMER, title: 'Visit completed' },
  'visit.declined': { audience: CUSTOMER, title: 'Visit declined' },
  'visit.cancelled': { audience: CUSTOMER, title: 'Visit cancelled' },
  'booking.completed': { audience: CUSTOMER_OR_CAREGIVER, title: 'Booking completed' },

  // ---- Bookings & visits: caregiver-facing
  'booking.requested': { audience: CAREGIVER, title: 'New booking request' },
  'booking.cancelled': { audience: CAREGIVER, title: 'Booking cancelled' },
  'booking.prescription.uploaded': { audience: CAREGIVER, title: 'Prescription uploaded' },
  'visit.rescheduled': { audience: CAREGIVER, title: 'Visit rescheduled' },
  'review.received': { audience: CAREGIVER, title: 'New review' },

  // ---- Payments
  'payment.cash.initiated': { audience: CAREGIVER, title: 'Cash payment started' },
  'payment.cash.customer_confirmed': { audience: CAREGIVER, title: 'Customer says cash was handed over' },
  'payment.cash.caregiver_confirmed': { audience: CUSTOMER, title: 'Caregiver confirmed the cash' },
  'payment.paid': { audience: CUSTOMER_OR_CAREGIVER, title: 'Payment verified' },
  'payment.failed': { audience: CUSTOMER, title: 'Payment failed' },

  // ---- Payouts: the caregiver asks, the admin transfers, the caregiver confirms
  'payout.requested': { audience: ADMIN, title: 'New payout request' },
  'payout.processing': { audience: CAREGIVER, title: 'Payout approved' },
  'payout.transferred': { audience: CAREGIVER, title: 'Payout sent: please confirm receipt' },
  'payout.rejected': { audience: CAREGIVER, title: 'Payout rejected' },
  'payout.confirmed': { audience: ADMIN, title: 'Caregiver confirmed the payout' },
  'payout.issue_reported': { audience: ADMIN, title: 'Caregiver reports the payout is missing' },

  // ---- Disputes & safety
  'dispute.raised': { audience: CUSTOMER_OR_CAREGIVER, title: 'A dispute was raised against you' },
  'dispute.raised.admin': { audience: ADMIN, title: 'New dispute to review' },
  'dispute.resolved': { audience: CUSTOMER_OR_CAREGIVER, title: 'Your dispute was resolved' },
  'safety_incident.reported': { audience: ADMIN, title: 'New safety report' },
  'safety_incident.updated': { audience: CUSTOMER_OR_CAREGIVER, title: 'Your safety report was updated' },
  'safety_incident.sos': { audience: ADMIN, title: 'SOS alert' },
  'safety_incident.sos.contact': { audience: CUSTOMER_OR_CAREGIVER, title: 'Emergency contacts alerted' },

  // ---- Caregiver verification
  'caregiver.registered': { audience: ADMIN, title: 'New caregiver registration' },
  'caregiver.document.uploaded': { audience: ADMIN, title: 'Caregiver uploaded a document' },
  'caregiver.verification.approved': { audience: CAREGIVER, title: 'Verification approved' },
  'caregiver.verification.rejected': { audience: CAREGIVER, title: 'Verification rejected' },

  // ---- Caregiver strikes (declined bookings / late arrivals / no-shows)
  'caregiver.strike.recorded': { audience: CAREGIVER, title: 'A strike was recorded on your account' },
  'caregiver.suspended': { audience: CAREGIVER, title: 'Your account has been suspended' },
  'caregiver.suspended.admin': { audience: ADMIN, title: 'Caregiver auto-suspended for repeated strikes' },
};

export function eventDefinition(event: string): NotificationEventDefinition | undefined {
  return NOTIFICATION_EVENTS[event];
}
