/**
 * Types mirroring the NestJS API responses (backend/prisma/schema.prisma and
 * the admin controllers). Dates arrive as ISO strings; Prisma Decimal fields
 * arrive as strings; money is integer minor units (paisa).
 */

export type UserRole = "CUSTOMER" | "CAREGIVER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type Specialty = "NURSING" | "PHYSIOTHERAPY" | "POST_SURGERY_CARE" | "ELDERLY_CARE";
export type LicenseBody = "PNC" | "PMDC" | "OTHER";
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
export type PayoutStatus = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";
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
  commissionRateId: string;
  verificationStatus: VerificationStatus;
  approvedAt: string | null;
  reverifyDueAt: string | null;
  ratingAverage: string;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
  user: { id: string; phone: string; fullName: string; status: UserStatus };
  documents: CaregiverDocument[];
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
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  raisedBy: { id: string; fullName: string; role: UserRole };
  againstUser: { id: string; fullName: string; role: UserRole };
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
