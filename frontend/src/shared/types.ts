/**
 * Types mirroring the NestJS API responses (backend/prisma/schema.prisma and
 * the admin controllers). Dates arrive as ISO strings; Prisma Decimal fields
 * arrive as strings; money is integer minor units (paisa).
 */

import type { Booking, Language, PatientRelation, PaymentMethod, PaymentStatus, Visit, VisitStatusHistory } from "./caregiver-types";

export type UserRole = "CUSTOMER" | "CAREGIVER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type Specialty = "NURSING" | "PHYSIOTHERAPY" | "POST_SURGERY_CARE" | "ELDERLY_CARE" | "DOCTOR";
export type LicenseBody = "PNC" | "PMDC" | "OTHER";
/** Caregiver ranking tier, computed by the backend from experience, rating and completed visits. */
export type CaregiverBadge = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type DocType = "LICENSE" | "CERTIFICATE" | "CNIC_COPY" | "OTHER";
export type BookingStatus = "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
export type VisitStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "DECLINED"
  | "CANCELLED"
  | "EN_ROUTE"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "CHECKED_OUT"
  | "COMPLETED";
export type PayoutStatus = "REQUESTED" | "PROCESSING" | "TRANSFERRED" | "PAID" | "REJECTED";
export type PayoutAccountType = "BANK" | "MOBILE_WALLET";
export type PromoDiscountType = "PERCENT" | "FIXED";
export type IncidentSource = "CUSTOMER_COMPLAINT" | "CAREGIVER_REPORT" | "SOS";
export type IncidentPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";
export type DisputeStatus = "OPEN" | "RESOLVED";
export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
export type ReportType = "payments" | "payouts" | "bookings" | "caregivers";

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

/* ---- Auth (/auth/*) ---------------------------------------------------- */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** JWT access-token payload issued by AuthService. */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  phone: string;
  type: "access";
}

/* ---- Caregivers (/admin/caregivers) ------------------------------------ */

export interface CaregiverDocument {
  id: string;
  caregiverId: string;
  type: DocType;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AdminCaregiver {
  id: string;
  userId: string;
  cnic: string;
  licenseNumber: string;
  licenseBody: LicenseBody;
  specialty: Specialty;
  experienceYears: number | null;
  bio: string | null;
  photoKey: string | null;
  serviceArea: { cities: string[] };
  ratePerVisit: number;
  /** Self-set pricing bracket (nullable); optional on the type so mock fixtures can omit them. */
  minRatePerVisit?: number | null;
  maxRatePerVisit?: number | null;
  /** Accumulated strikes; auto-suspends at the platform threshold. */
  strikeCount?: number;
  commissionRateId: string;
  verificationStatus: VerificationStatus;
  approvedAt: string | null;
  reverifyDueAt: string | null;
  ratingAverage: string;
  ratingCount: number;
  /** Effective ranking tier: the admin override when set, otherwise server-computed. Backend must add to the admin payload — see requirement.md. */
  badge?: CaregiverBadge | null;
  /** Manual tier override set by an admin; null/absent = auto-computed. */
  badgeOverride?: CaregiverBadge | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; phone: string; fullName: string; status: UserStatus };
  documents: CaregiverDocument[];
}

/** One row of the admin payments ledger — GET /admin/payments. Nested shape mirrors the backend (payment + visit→booking context). */
export interface AdminPayment {
  id: string;
  visitId: string;
  amount: number;
  commissionAmount: number;
  caregiverAmount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayRef: string | null;
  createdAt: string;
  paidAt: string | null;
  visit: {
    booking: {
      patient: { id: string; name: string };
      customer: { id: string; phone: string; fullName: string };
      caregiver: { id: string; specialty: Specialty; user: { fullName: string } };
    };
  };
  payoutRequest: { id: string; status: PayoutStatus } | null;
}

export type CallStatus = "INITIATED" | "CONNECTED" | "ENDED" | "MISSED" | "REJECTED";
export type StrikeReason = "DECLINED" | "LATE_ARRIVAL" | "NO_SHOW";

/** One row of the admin audit log — GET /admin/audit-logs (backend read endpoint pending; see requirement.md). */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  at: string;
}

/** One persisted in-app call — GET /admin/call-logs (backend read endpoint pending; see requirement.md). */
export interface CallLogEntry {
  id: string;
  visitId: string;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  caller: { id: string; fullName: string };
  callee: { id: string; fullName: string };
}

/** GET /admin/bookings item — operator bookings browser (read-only). */
export interface AdminBookingListItem extends Booking {
  customer: { id: string; fullName: string; phone: string };
  caregiver: { id: string; specialty: Specialty; user: { fullName: string } };
  patient: { id: string; name: string; relationship: PatientRelation };
  address: { id: string; addressLine: string; city: string };
  visits: { id: string; status: VisitStatus; scheduledDate: string }[];
}

/** GET /admin/customers item — operator customer directory. */
export interface AdminCustomer {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  status: UserStatus;
  preferredLanguage: Language;
  lastLoginAt: string | null;
  createdAt: string;
}

/** GET /admin/customers/:id — profile + booking summary. */
export interface AdminCustomerDetail extends AdminCustomer {
  bookingsTotal: number;
  recentBookings: {
    id: string;
    status: BookingStatus;
    serviceType: Specialty;
    startDate: string;
    endDate: string;
    createdAt: string;
    caregiver: { id: string; user: { fullName: string } };
  }[];
}

/** GET /admin/visits item — operator visits browser (GPS check-in/out + cancellation visible). */
export interface AdminVisitListItem extends Visit {
  booking: {
    id: string;
    status: BookingStatus;
    isImmediate: boolean;
    cancelledAt: string | null;
    cancelledById: string | null;
    cancelReason: string | null;
    customer: { id: string; fullName: string; phone: string };
    caregiver: { id: string; specialty: Specialty; user: { fullName: string } };
    address: { id: string; addressLine: string; city: string };
  };
  statusHistory: VisitStatusHistory[];
}

/**
 * What approve/reject/reverify/suspend/reactivate return: the profile with
 * documents but no `user`, and the CNIC still encrypted (only the list route
 * decrypts it). Merge it into the AdminCaregiver you already have.
 */
export type AdminCaregiverRecord = Omit<AdminCaregiver, "user">;

export interface DocumentUrl {
  url: string;
  mimeType: string;
}

/* ---- Analytics (/admin/analytics) -------------------------------------- */

export interface AnalyticsOverview {
  range: AnalyticsRange;
  bookings: {
    total: number;
    byStatus: Partial<Record<BookingStatus, number>>;
    cancellationRate: number;
  };
  caregivers: { active: number; pendingVerification: number };
  payments: { paidCount: number; grossRevenue: number; commissionRevenue: number };
  payouts: { paidOut: number };
  visits: { completed: number };
}

/* ---- Safety (/admin/safety-incidents) ---------------------------------- */

export interface IncidentEvent {
  id: string;
  incidentId: string;
  actorId: string;
  action: string;
  note: string | null;
  at: string;
}

export interface SafetyIncident {
  id: string;
  visitId: string | null;
  reportedById: string;
  source: IncidentSource;
  description: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assignedAdminId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reportedBy: { id: string; fullName: string; role: UserRole; phone: string };
  assignedAdmin: { id: string; fullName: string } | null;
  events: IncidentEvent[];
}

/** PATCH /admin/safety-incidents/:id returns the bare row (no relations). */
export type SafetyIncidentRecord = Omit<SafetyIncident, "reportedBy" | "assignedAdmin" | "events">;

export interface UpdateIncidentInput {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  note?: string;
}

/* ---- Disputes (/admin/disputes) ---------------------------------------- */

export interface Dispute {
  id: string;
  visitId: string;
  raisedById: string;
  againstUserId: string;
  description: string;
  status: DisputeStatus;
  /** Triage priority (same scale as safety incidents). Backend always sends it; optional here for older/mock rows. */
  priority?: IncidentPriority;
  assignedAdminId?: string | null;
  /** Compensation/refund (paisa) the admin recorded at resolution — a mediation record, not a gateway refund. */
  compensationAmount?: number | null;
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  raisedBy: { id: string; fullName: string; role: UserRole };
  againstUser: { id: string; fullName: string; role: UserRole };
  assignedAdmin?: { id: string; fullName: string } | null;
  visit: { id: string; bookingId: string; status: VisitStatus };
}

/** PATCH /admin/disputes/:id/resolve returns the bare row (no relations). */
export type DisputeRecord = Omit<Dispute, "raisedBy" | "againstUser" | "visit">;

/* ---- Payouts (/admin/payouts) ------------------------------------------ */

export interface PayoutAccount {
  id: string;
  caregiverId: string;
  type: PayoutAccountType;
  provider: string;
  accountTitle: string;
  /** Masked by the API, e.g. "******4321". */
  accountNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPayoutRequest {
  id: string;
  caregiverId: string;
  payoutAccountId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: string;
  processedAt: string | null;
  caregiver: { id: string; specialty: Specialty; user: { fullName: string; phone: string } };
  payoutAccount: PayoutAccount;
  /** Phase 15: two-sided payouts. */
  transferredAt?: string | null;
  transferReference?: string | null;
  caregiverConfirmedAt?: string | null;
  issueReportedAt?: string | null;
  issueNote?: string | null;
}

/** POST /admin/payouts/:id/(approve|mark-paid|reject) return the bare row. */
export type PayoutRequestRecord = Omit<AdminPayoutRequest, "caregiver" | "payoutAccount">;

export interface ResolvePayoutInput {
  reason?: string;
  note?: string;
}

/* ---- Commissions (/admin/commissions) ---------------------------------- */

export interface CommissionRate {
  id: string;
  category: Specialty;
  /** Decimal(5,2) serialised as a string, e.g. "15.00". */
  percentage: string;
  effectiveFrom: string;
  createdAt: string;
  updatedAt: string;
}

/* ---- Promos (/admin/promos) -------------------------------------------- */

export interface PromoCode {
  id: string;
  code: string;
  discountType: PromoDiscountType;
  /** PERCENT: 1–100. FIXED: paisa. */
  discountValue: number;
  validFrom: string;
  validTo: string;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoInput {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  validFrom: string;
  validTo: string;
  maxUses?: number;
  active?: boolean;
}

export type UpdatePromoInput = Partial<Omit<CreatePromoInput, "code">>;

/* ---- Platform config (/admin/config) ----------------------------------- */

export interface PlatformConfigItem {
  key: string;
  envVar: string;
  envDefault: number;
  description: string;
  value: number;
  overridden: boolean;
}

/** PUT /admin/config/:key returns the definition and new value (no `overridden`). */
export type PlatformConfigSetResult = Omit<PlatformConfigItem, "overridden">;
