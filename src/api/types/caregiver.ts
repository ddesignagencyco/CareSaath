/**
 * Caregiver-facing API shapes, derived from the backend service code (not
 * Swagger, which differs in places). Dates are ISO strings; @db.Date columns
 * arrive as "YYYY-MM-DDT00:00:00.000Z"; Decimals arrive as strings; money is
 * integer paisa.
 */
import type {
  CaregiverDocument,
  CommissionRate,
  DisputeStatus,
  IncidentPriority,
  IncidentSource,
  IncidentStatus,
  LicenseBody,
  PayoutAccount,
  PayoutAccountType,
  PayoutStatus,
  Specialty,
  UserRole,
  UserStatus,
  VerificationStatus,
  VisitStatus,
} from "./core";

export type Language = "EN" | "UR";
export type PatientRelation = "SELF" | "FAMILY_MEMBER";
export type BookingType = "SINGLE" | "RECURRING";
export type CaregiverBookingStatus = "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
export type CheckMethod = "GPS" | "OTP";
export type PaymentMethod = "CASH" | "CARD" | "JAZZCASH" | "EASYPAISA";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type NotificationChannel = "SMS" | "WHATSAPP" | "PUSH";

/* ---- Identity (GET /customer/me works for any role) --------------------- */

export interface Me {
  id: string;
  phone: string;
  role: UserRole;
  fullName: string;
  preferredLanguage: Language;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  caregiverProfile: { id: string; verificationStatus: VerificationStatus } | null;
}

/* ---- Profile ------------------------------------------------------------- */

export interface CaregiverProfileRow {
  id: string;
  userId: string;
  /** Masked on GET ("***********11-1"); raw ciphertext on register/PATCH — never display those. */
  cnic: string | null;
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
}

export interface CredentialReview {
  id: string;
  caregiverId: string;
  reviewerId: string;
  kind: "INITIAL" | "PERIODIC";
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
  decidedAt: string;
}

/** GET /caregiver/profile */
export interface MyCaregiverProfile extends CaregiverProfileRow {
  documents: CaregiverDocument[];
  /** Latest 5, newest first. */
  credentialReviews: CredentialReview[];
  commissionRate: CommissionRate;
}

export interface RegisterCaregiverInput {
  /** Exactly 15 chars, e.g. "35201-1234567-1". */
  cnic: string;
  licenseNumber: string;
  licenseBody: LicenseBody;
  specialty: Specialty;
  experienceYears?: number;
  bio?: string;
  serviceCities: string[];
  /** Paisa, min 1000 (Rs 10). */
  ratePerVisit: number;
}

export interface UpdateCaregiverProfileInput {
  specialty?: Specialty;
  ratePerVisit?: number;
  serviceCities?: string[];
  bio?: string;
  experienceYears?: number;
}

/* ---- Availability -------------------------------------------------------- */

export interface AvailabilityRule {
  id: string;
  caregiverId: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AvailabilityBlock {
  id: string;
  caregiverId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string;
}

export interface Availability {
  rules: AvailabilityRule[];
  /** Only blocks that haven't ended. */
  blocks: AvailabilityBlock[];
}

export type AvailabilityRuleInput = Pick<AvailabilityRule, "dayOfWeek" | "startTime" | "endTime">;

/* ---- Bookings & visits --------------------------------------------------- */

export interface Address {
  id: string;
  userId: string;
  label: string | null;
  addressLine: string;
  city: string;
  latitude: string;
  longitude: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfile {
  id: string;
  ownerUserId: string;
  name: string;
  relationship: PatientRelation;
  dateOfBirth: string | null;
  gender: string | null;
  /** Decrypted for the assigned caregiver. */
  medicalContext: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  customerId: string;
  patientId: string;
  caregiverId: string;
  addressId: string;
  type: BookingType;
  /** weekdays: 1 = Monday … 7 = Sunday (ISO) — differs from availability! */
  recurrenceRule: { weekdays: number[]; startDate: string; endDate: string } | null;
  startDate: string;
  endDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  serviceType: Specialty;
  rateSnapshot: number;
  promoCodeId: string | null;
  discountAmount: number;
  status: CaregiverBookingStatus;
  /** createdAt + response window; informational, not enforced by the API. */
  respondBy: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  bookingId: string;
  scheduledDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  status: VisitStatus;
  enRouteAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInMethod: CheckMethod | null;
  checkOutMethod: CheckMethod | null;
  checkInLat: string | null;
  checkInLng: string | null;
  checkOutLat: string | null;
  checkOutLng: string | null;
  rescheduledFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitStatusHistory {
  id: string;
  visitId: string;
  fromStatus: VisitStatus | null;
  toStatus: VisitStatus;
  actorId: string | null;
  at: string;
}

export interface VisitNote {
  id: string;
  visitId: string;
  caregiverId: string;
  summary: string;
  submittedAt: string;
}

export interface Review {
  id: string;
  visitId: string;
  customerId: string;
  caregiverId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionDocument {
  id: string;
  bookingId: string;
  uploadedById: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export type PrescriptionSummary = Pick<PrescriptionDocument, "id" | "mimeType" | "sizeBytes" | "createdAt" | "uploadedById">;

/** GET /caregiver/bookings item */
export interface CaregiverBookingListItem extends Booking {
  patient: { id: string; name: string; relationship: PatientRelation };
  address: Address;
  visits: Visit[];
}

/** accept / decline response */
export interface BookingDetail extends Booking {
  visits: Visit[];
  patient: { id: string; name: string; relationship: PatientRelation };
  address: Address;
  caregiver: { id: string; specialty: Specialty; userId: string };
  prescriptions: PrescriptionSummary[];
}

/** GET /caregiver/visits item */
export interface CaregiverVisitListItem extends Visit {
  booking: Booking & {
    patient: { name: string; relationship: PatientRelation };
    address: Address;
  };
}

/** GET /caregiver/visits/:id (and POST …/note) */
export interface CaregiverVisitDetail extends Visit {
  booking: Booking & {
    patient: PatientProfile;
    address: Address;
    prescriptions: PrescriptionDocument[];
    customer: { id: string; phone: string; fullName: string };
  };
  statusHistory: VisitStatusHistory[];
  note: VisitNote | null;
  review: Review | null;
  /** The visit's payments, so the caregiver can confirm cash by id. */
  payments?: VisitPaymentSummary[];
}

/** `payments` item on GET /caregiver/visits/:id. */
export interface VisitPaymentSummary {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  caregiverAmount: number;
  paidAt: string | null;
  customerConfirmedAt?: string | null;
  caregiverConfirmedAt?: string | null;
}

/** POST /caregiver/payments/:id/confirm-cash — the updated Payment row. */
export interface CaregiverPaymentRow {
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
}

export interface CheckInInput {
  method?: CheckMethod;
  lat?: number;
  lng?: number;
  code?: string;
}

/* ---- Money --------------------------------------------------------------- */

export interface Earnings {
  availableAmount: number;
  availableCount: number;
  pendingAmount: number;
  pendingCount: number;
  lifetimeEarnings: number;
  lifetimeCommission: number;
  lifetimeVisits: number;
  recentPayoutRequests: PayoutRequestRow[];
}

export interface PayoutRequestRow {
  id: string;
  caregiverId: string;
  payoutAccountId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: string;
  processedAt: string | null;
  transferredAt?: string | null;
  caregiverConfirmedAt?: string | null;
  /** Set when the caregiver reports a TRANSFERRED payout as not received. */
  issueReportedAt?: string | null;
  issueNote?: string | null;
}

export interface CaregiverPayoutRequest extends PayoutRequestRow {
  payoutAccount: PayoutAccount;
}

export interface PayoutAccountInput {
  type: PayoutAccountType;
  provider: string;
  accountTitle: string;
  accountNumber: string;
}

/* ---- Safety, disputes, notifications ------------------------------------- */

export interface SafetyIncidentRow {
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
}

/** POST /sos body. latitude/longitude: the DTO types them as strings with no validator (accepted, currently unused). */
export interface SosInput {
  visitId: string;
  note?: string;
  latitude?: string;
  longitude?: string;
}

export interface SosResult {
  incident: SafetyIncidentRow;
  notifiedAdmins: number;
  notifiedContacts: number;
}

export interface DisputeRow {
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
}

export interface AppNotification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: "QUEUED" | "SENT" | "FAILED";
  /** Server-written English copy; shown for events the app has no wording for. */
  title?: string | null;
  body?: string | null;
  sentAt: string | null;
  /** Null while unread; set when the user marks it read (POST /notifications/read). */
  readAt: string | null;
  createdAt: string;
}
