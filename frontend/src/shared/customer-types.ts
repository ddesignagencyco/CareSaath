/**
 * Customer-facing API shapes (patients, addresses, public caregivers,
 * bookings, payments), derived from the backend service code.
 * Dates are ISO strings; Decimals are strings; money is integer paisa.
 */
import type { AvailabilityRule, Booking, CaregiverVisitDetail, PaymentMethod, PaymentStatus, PatientRelation, Visit } from "./caregiver-types";
import type { CaregiverBadge, LicenseBody, PayoutStatus, Specialty } from "./types";

/* ---- Public caregiver directory (GET /caregivers, @Public) -------------- */

/** GET /caregivers?specialty=&city=&page=&limit= item (approved + active only, best rated first). */
export interface CaregiverSearchItem {
  id: string;
  specialty: Specialty;
  ratePerVisit: number;
  experienceYears: number | null;
  bio: string | null;
  ratingAverage: string;
  ratingCount: number;
  serviceArea: { cities: string[] };
  user: { fullName: string };
  /** Viewable profile photo URL (null when none uploaded). */
  photoUrl: string | null;
  /** Ranking tier, computed by the backend on every read. */
  badge?: CaregiverBadge;
}

/** GET /caregivers/:id */
export interface PublicCaregiver extends CaregiverSearchItem {
  licenseNumber: string;
  licenseBody: LicenseBody;
  createdAt: string;
  availabilityRules: Pick<AvailabilityRule, "dayOfWeek" | "startTime" | "endTime">[];
}

/* ---- Patients & addresses ------------------------------------------------ */

export interface PatientInput {
  name: string;
  relationship?: PatientRelation;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  gender?: string;
  medicalContext?: string;
}

export interface AddressInput {
  label?: string;
  addressLine: string;
  city: string;
  /** Decimal strings, up to 8 decimal places. */
  latitude: string;
  longitude: string;
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

/* ---- Bookings ------------------------------------------------------------ */

export interface CreateBookingInput {
  patientId: string;
  caregiverId: string;
  addressId: string;
  type?: "SINGLE" | "RECURRING";
  /** ASAP booking: SINGLE only; the caregiver gets a short response window and must be nearby. */
  isImmediate?: boolean;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:mm */
  timeWindowStart: string;
  timeWindowEnd: string;
  /**
   * Recurring only: 1 = Monday … 7 = Sunday, sent as JSON numbers. The spec
   * says string[], but the DTO validates @IsInt({ each }) @Min(1) @Max(7).
   */
  weekdays?: number[];
  promoCode?: string;
}

/** GET /customer/bookings item: booking + visits only. */
export interface CustomerBookingListItem extends Booking {
  visits: Visit[];
  /** Completed visits this caregiver already did for this customer's family (excludes this booking). */
  priorVisitsWithCaregiver?: number;
}

export interface RescheduleInput {
  visitId: string;
  newDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
}

/** GET /customer/visits/:id — same include as the caregiver visit detail (no caregiver identity). */
export type CustomerVisitDetail = CaregiverVisitDetail;

/* ---- Payments ------------------------------------------------------------ */

export interface CustomerPayment {
  id: string;
  visitId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  commissionAmount: number;
  caregiverAmount: number;
  gatewayRef: string | null;
  paidAt: string | null;
  payoutRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Phase 15: two-sided cash — PAID only once both are set. */
  customerConfirmedAt?: string | null;
  caregiverConfirmedAt?: string | null;
  confirmationNote?: string | null;
}

/** GET /customer/payments item and GET /customer/payments/:id */
export interface CustomerPaymentWithVisit extends CustomerPayment {
  /** Set once the caregiver's share is part of a payout request. */
  payoutRequest: { id: string; status: PayoutStatus } | null;
  visit: Visit & {
    booking: Booking & {
      patient: { id: string; name: string };
      customer: { id: string; phone: string; fullName: string };
    };
  };
}

/**
 * POST /customer/payments response. Cash returns the bare payment row; a
 * gateway method (CARD via Stripe, or JazzCash/Easypaisa) returns the payment
 * plus a hosted-checkout URL the customer is redirected to.
 */
export type InitiatePaymentResult = CustomerPayment | { payment: CustomerPayment; checkoutUrl: string };

/** GET /promos/quote — a per-visit discount preview for the review step. */
export interface PromoQuote {
  code: string;
  discountAmount: number;
  perVisitAfterDiscount: number;
}

export interface ReviewInput {
  /** 1–5 */
  rating: number;
  comment?: string;
}
