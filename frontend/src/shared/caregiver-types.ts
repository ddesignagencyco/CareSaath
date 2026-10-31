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
  CaregiverBadge,
  Specialty,
  UserRole,
  UserStatus,
  VerificationStatus,
  VisitStatus,
} from "./types";

export type Language = "EN" | "UR";
export type PatientRelation = "SELF" | "FAMILY_MEMBER";
export type BookingType = "SINGLE" | "RECURRING";
export type CaregiverBookingStatus = "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
export type CheckMethod = "GPS" | "OTP";
export type PaymentMethod = "CASH" | "CARD" | "JAZZCASH" | "EASYPAISA";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type NotificationChannel = "SMS" | "WHATSAPP" | "PUSH" | "EMAIL";

/* ---- Identity (GET /customer/me works for any role) --------------------- */

export interface Me {
  id: string;
  phone: string;
  /** Optional on the type so mock fixtures can omit it; the real API always returns it (nullable). */
  email?: string | null;
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
  /** Self-set pricing bracket: ratePerVisit must stay within [min, max]. Null = single point at ratePerVisit. */
  minRatePerVisit?: number | null;
  maxRatePerVisit?: number | null;
  commissionRateId: string;
  verificationStatus: VerificationStatus;
  /** Accumulated strikes (declines, late arrivals); auto-suspends at the platform threshold. */
  strikeCount?: number;
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
  /** Ranking tier, computed by the backend on every read. */
  badge?: CaregiverBadge;
  /** Opted in to immediate (ASAP/emergency) requests. */
  acceptingImmediate?: boolean;
  /** Actually bookable right now: acceptingImmediate + a fresh live fix + not mid-visit/blacked out. */
  availableNow?: boolean;
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
  minRatePerVisit?: number;
  maxRatePerVisit?: number;
}

export interface UpdateCaregiverProfileInput {
  specialty?: Specialty;
  ratePerVisit?: number;
  minRatePerVisit?: number;
  maxRatePerVisit?: number;
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
  /** ASAP booking: the caregiver gets a short response window and must be nearby. */
  isImmediate?: boolean;
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

/* ---- Medical orders (doctor-only diagnosis / prescriptions / lab tests) --- */

export interface Medicine {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface LabTest {
  name: string;
  instructions?: string;
}

/** A doctor's structured record for a visit. medicines/labTests are stored as JSON. */
export interface MedicalOrder {
  id: string;
  visitId: string;
  doctorId: string;
  patientId: string;
  diagnosis: string | null;
  medicines: Medicine[];
  labTests: LabTest[];
  createdAt: string;
}

/** POST /caregiver/visits/:visitId/medical-orders — at least one field should be present. */
export interface CreateMedicalOrderInput {
  diagnosis?: string;
  medicines?: Medicine[];
  labTests?: LabTest[];
}

/** GET /caregiver/bookings item */
export interface CaregiverBookingListItem extends Booking {
  patient: { id: string; name: string; relationship: PatientRelation };
  address: Address;
  visits: Visit[];
  /**
   * Completed visits this caregiver already did for this customer's family (excludes this booking).
   * Already computed by the backend for BookingDetail; the list endpoint should include it too so the
   * request card can flag returning customers. The badge renders only when the field is present.
   */
  priorVisitsWithCaregiver?: number;
}

/** accept / decline response */
export interface BookingDetail extends Booking {
  visits: Visit[];
  patient: { id: string; name: string; relationship: PatientRelation };
  address: Address;
  caregiver: { id: string; specialty: Specialty; userId: string };
  prescriptions: PrescriptionSummary[];
  /** Completed visits this caregiver already did for this customer's family (excludes this booking). */
  priorVisitsWithCaregiver?: number;
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
    /** Caregiver-facing responses omit the customer's phone (privacy); the backend sends the check-in OTP itself. */
    customer: { id: string; fullName: string };
  };
  statusHistory: VisitStatusHistory[];
  note: VisitNote | null;
  review: Review | null;
  /**
   * NOT returned by the backend today (VisitsService.visitInclude has no
   * payments), so the caregiver can't learn the paymentId needed for
   * POST /caregiver/payments/:id/confirm-cash. The mock returns it as the
   * proposed shape; the UI only offers "Confirm cash" when it is present.
   */
  payments?: VisitPaymentSummary[];
}

/** Proposed `payments` item on GET /caregiver/visits/:id (see above). */
export interface VisitPaymentSummary {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  caregiverAmount: number;
  paidAt: string | null;
  /** Phase 15: two-sided cash — PAID only once both are set. */
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
  /** Phase 15: two-sided payouts (admin sends → caregiver confirms arrival). */
  transferredAt?: string | null;
  transferReference?: string | null;
  caregiverConfirmedAt?: string | null;
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

/** GET/PATCH /notifications/preferences — one per channel; a channel with no saved row defaults to enabled. */
export interface NotificationPref {
  channel: NotificationChannel;
  enabled: boolean;
}

/** A caregiver sub-city coverage zone — GET /caregiver/service-areas item + the public `serviceAreas` on GET /caregivers/:id. */
export interface CaregiverServiceArea {
  id: string;
  city: string;
  label: string | null;
  /** Decimal strings. */
  latitude: string;
  longitude: string;
  radiusMeters: number;
}

/** One zone for PUT /caregiver/service-areas (full replace; empty list = whole-city coverage). */
export interface ServiceAreaInput {
  city: string;
  label?: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: "QUEUED" | "SENT" | "FAILED";
  sentAt: string | null;
  /** Null while unread; set when the user marks it read (POST /notifications/read). */
  readAt: string | null;
  createdAt: string;
}
