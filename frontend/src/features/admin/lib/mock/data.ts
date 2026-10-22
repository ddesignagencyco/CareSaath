/**
 * Seed data for UI development. Shapes match the API responses exactly so
 * the screens behave the same once wired to the backend.
 */
import type {
  AdminCaregiver,
  AdminPayoutRequest,
  CaregiverDocument,
  CommissionRate,
  Dispute,
  DocType,
  LicenseBody,
  PlatformConfigItem,
  PromoCode,
  SafetyIncident,
  Specialty,
  UserStatus,
  VerificationStatus,
} from "@shared/types";

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 3_600_000).toISOString();
const ahead = (days: number) => new Date(now + days * DAY).toISOString();

export const MOCK_ADMIN = { id: "admin-0001", fullName: "Platform Admin", phone: "+923000000000" };

const COMMISSION_IDS: Record<Specialty, string> = {
  NURSING: "cr-nursing",
  PHYSIOTHERAPY: "cr-physio",
  POST_SURGERY_CARE: "cr-postsurgery",
  ELDERLY_CARE: "cr-elderly",
};

export const commissionRates: CommissionRate[] = [
  { id: "cr-elderly", category: "ELDERLY_CARE", percentage: "12", effectiveFrom: ago(60), createdAt: ago(120), updatedAt: ago(60) },
  { id: "cr-nursing", category: "NURSING", percentage: "15", effectiveFrom: ago(90), createdAt: ago(120), updatedAt: ago(90) },
  { id: "cr-physio", category: "PHYSIOTHERAPY", percentage: "18", effectiveFrom: ago(30), createdAt: ago(120), updatedAt: ago(30) },
  { id: "cr-postsurgery", category: "POST_SURGERY_CARE", percentage: "15", effectiveFrom: ago(120), createdAt: ago(120), updatedAt: ago(120) },
];

interface CaregiverSeed {
  name: string;
  phone: string;
  specialty: Specialty;
  body: LicenseBody;
  status: VerificationStatus;
  userStatus?: UserStatus;
  years: number;
  rate: number; // rupees
  cities: string[];
  rating: [string, number];
  createdDaysAgo: number;
  approvedDaysAgo?: number;
  reverifyInDays?: number;
  docs: DocType[];
  bio?: string;
}

const seeds: CaregiverSeed[] = [
  { name: "Ayesha Siddiqui", phone: "+923214567801", specialty: "NURSING", body: "PNC", status: "PENDING", years: 6, rate: 2500, cities: ["Lahore"], rating: ["0.00", 0], createdDaysAgo: 0.2, docs: ["LICENSE", "CERTIFICATE", "CNIC_COPY"], bio: "ICU-trained staff nurse, 6 years at Services Hospital. Wound care and IV management." },
  { name: "Muhammad Bilal", phone: "+923335512090", specialty: "PHYSIOTHERAPY", body: "OTHER", status: "PENDING", years: 4, rate: 3000, cities: ["Lahore"], rating: ["0.00", 0], createdDaysAgo: 1, docs: ["LICENSE", "CERTIFICATE"], bio: "DPT, stroke and post-fracture rehabilitation." },
  { name: "Sana Rauf", phone: "+923001239876", specialty: "POST_SURGERY_CARE", body: "PNC", status: "PENDING", years: 9, rate: 3500, cities: ["Islamabad", "Rawalpindi"], rating: ["0.00", 0], createdDaysAgo: 2, docs: ["LICENSE", "CNIC_COPY"] },
  { name: "Imran Qureshi", phone: "+923455678123", specialty: "ELDERLY_CARE", body: "OTHER", status: "PENDING", years: 3, rate: 1800, cities: ["Lahore"], rating: ["0.00", 0], createdDaysAgo: 3, docs: [] },
  { name: "Fatima Noor", phone: "+923128899001", specialty: "NURSING", body: "PNC", status: "PENDING", years: 2, rate: 2000, cities: ["Islamabad"], rating: ["0.00", 0], createdDaysAgo: 4, docs: ["LICENSE"] },
  { name: "Hina Javed", phone: "+923017766554", specialty: "NURSING", body: "PNC", status: "APPROVED", years: 11, rate: 3200, cities: ["Lahore"], rating: ["4.86", 64], createdDaysAgo: 340, approvedDaysAgo: 338, reverifyInDays: 27, docs: ["LICENSE", "CERTIFICATE", "CNIC_COPY"], bio: "Senior nurse, palliative and elderly home care." },
  { name: "Usman Tariq", phone: "+923334411223", specialty: "PHYSIOTHERAPY", body: "OTHER", status: "APPROVED", years: 7, rate: 3800, cities: ["Lahore"], rating: ["4.72", 41], createdDaysAgo: 300, approvedDaysAgo: 298, reverifyInDays: 67, docs: ["LICENSE", "CERTIFICATE"] },
  { name: "Rabia Aslam", phone: "+923219988776", specialty: "POST_SURGERY_CARE", body: "PNC", status: "APPROVED", years: 8, rate: 3500, cities: ["Islamabad"], rating: ["4.91", 38], createdDaysAgo: 375, approvedDaysAgo: 372, reverifyInDays: -7, docs: ["LICENSE", "CNIC_COPY"] },
  { name: "Kamran Shah", phone: "+923005544332", specialty: "ELDERLY_CARE", body: "OTHER", status: "APPROVED", years: 5, rate: 2200, cities: ["Rawalpindi", "Islamabad"], rating: ["4.55", 22], createdDaysAgo: 200, approvedDaysAgo: 196, reverifyInDays: 169, docs: ["CERTIFICATE", "CNIC_COPY"] },
  { name: "Nadia Hussain", phone: "+923451122334", specialty: "NURSING", body: "PNC", status: "APPROVED", years: 4, rate: 2400, cities: ["Lahore"], rating: ["4.67", 18], createdDaysAgo: 150, approvedDaysAgo: 146, reverifyInDays: 219, docs: ["LICENSE"] },
  { name: "Dr. Saad Mehmood", phone: "+923218877665", specialty: "PHYSIOTHERAPY", body: "PMDC", status: "APPROVED", years: 12, rate: 5000, cities: ["Islamabad"], rating: ["4.95", 87], createdDaysAgo: 360, approvedDaysAgo: 359, reverifyInDays: 6, docs: ["LICENSE", "CERTIFICATE"] },
  { name: "Zainab Ali", phone: "+923336655443", specialty: "ELDERLY_CARE", body: "OTHER", status: "APPROVED", userStatus: "DEACTIVATED", years: 3, rate: 1800, cities: ["Lahore"], rating: ["3.90", 10], createdDaysAgo: 180, approvedDaysAgo: 175, reverifyInDays: 190, docs: ["CERTIFICATE"] },
  { name: "Tahir Abbas", phone: "+923004433221", specialty: "NURSING", body: "PNC", status: "REJECTED", years: 1, rate: 1500, cities: ["Lahore"], rating: ["0.00", 0], createdDaysAgo: 20, docs: ["CERTIFICATE"] },
  { name: "Mehwish Akram", phone: "+923127788990", specialty: "PHYSIOTHERAPY", body: "OTHER", status: "REJECTED", years: 2, rate: 2500, cities: ["Islamabad"], rating: ["0.00", 0], createdDaysAgo: 35, docs: ["LICENSE"] },
  { name: "Faisal Iqbal", phone: "+923459900112", specialty: "POST_SURGERY_CARE", body: "PNC", status: "SUSPENDED", years: 6, rate: 3000, cities: ["Lahore"], rating: ["3.40", 15], createdDaysAgo: 250, approvedDaysAgo: 245, reverifyInDays: 120, docs: ["LICENSE", "CNIC_COPY"] },
];

const MIME: Record<DocType, [string, number]> = {
  LICENSE: ["application/pdf", 412_000],
  CERTIFICATE: ["application/pdf", 988_000],
  CNIC_COPY: ["image/jpeg", 245_000],
  OTHER: ["image/png", 120_000],
};

function cnicFor(i: number): string {
  const n = String(3520100000000 + i * 7919_013).slice(0, 13);
  return `${n.slice(0, 5)}-${n.slice(5, 12)}-${n.slice(12)}`;
}

export const caregivers: AdminCaregiver[] = seeds.map((s, i) => {
  const id = `cg-${String(i + 1).padStart(4, "0")}`;
  const createdAt = ago(s.createdDaysAgo);
  const documents: CaregiverDocument[] = s.docs.map((type, d) => ({
    id: `${id}-doc-${d + 1}`,
    caregiverId: id,
    type,
    fileKey: `caresaath/caregivers/${id}/${type.toLowerCase()}`,
    mimeType: MIME[type][0],
    sizeBytes: MIME[type][1],
    createdAt,
  }));
  return {
    id,
    userId: `user-${id}`,
    cnic: cnicFor(i + 1),
    licenseNumber: s.body === "PMDC" ? `PMDC-${48210 + i}-P` : s.body === "PNC" ? `PNC-RN-${210450 + i * 37}` : `PPTA-${3100 + i}`,
    licenseBody: s.body,
    specialty: s.specialty,
    experienceYears: s.years,
    bio: s.bio ?? null,
    photoKey: null,
    serviceArea: { cities: s.cities },
    ratePerVisit: s.rate * 100,
    commissionRateId: COMMISSION_IDS[s.specialty],
    verificationStatus: s.status,
    approvedAt: s.approvedDaysAgo !== undefined ? ago(s.approvedDaysAgo) : null,
    reverifyDueAt: s.reverifyInDays !== undefined ? ahead(s.reverifyInDays) : null,
    ratingAverage: String(Number(s.rating[0])), // Prisma Decimal: "0", "4.8"
    ratingCount: s.rating[1],
    createdAt,
    updatedAt: createdAt,
    user: { id: `user-${id}`, phone: s.phone, fullName: s.name, status: s.userStatus ?? "ACTIVE" },
    documents,
  };
});

const cg = (i: number) => caregivers[i];

export const incidents: SafetyIncident[] = [
  {
    id: "inc-0001",
    visitId: "visit-2231",
    reportedById: "user-cust-11",
    source: "SOS",
    description: "SOS pressed during visit. Patient (78) became unresponsive; caregiver requested ambulance. Family emergency contact alerted.",
    priority: "CRITICAL",
    status: "OPEN",
    assignedAdminId: null,
    resolvedAt: null,
    createdAt: ago(0, 0.3),
    updatedAt: ago(0, 0.3),
    reportedBy: { id: "user-cust-11", fullName: "Ahmed Raza", role: "CUSTOMER", phone: "+923211234567" },
    assignedAdmin: null,
    events: [],
  },
  {
    id: "inc-0002",
    visitId: "visit-2207",
    reportedById: cg(5).userId,
    source: "CAREGIVER_REPORT",
    description: "Aggressive family member at the patient's home in Johar Town; I left before completing the dressing change.",
    priority: "HIGH",
    status: "IN_REVIEW",
    assignedAdminId: MOCK_ADMIN.id,
    resolvedAt: null,
    createdAt: ago(0, 5),
    updatedAt: ago(0, 3),
    reportedBy: { id: cg(5).userId, fullName: cg(5).user.fullName, role: "CAREGIVER", phone: cg(5).user.phone },
    assignedAdmin: { id: MOCK_ADMIN.id, fullName: MOCK_ADMIN.fullName },
    events: [
      { id: "ev-1", incidentId: "inc-0002", actorId: MOCK_ADMIN.id, action: "status:OPEN->IN_REVIEW", note: "Called caregiver; she is safe. Contacting customer.", at: ago(0, 3) },
    ],
  },
  {
    id: "inc-0003",
    visitId: "visit-2190",
    reportedById: "user-cust-07",
    source: "CUSTOMER_COMPLAINT",
    description: "Caregiver arrived 90 minutes late and did not wear a mask during the visit.",
    priority: "MEDIUM",
    status: "OPEN",
    assignedAdminId: null,
    resolvedAt: null,
    createdAt: ago(1, 2),
    updatedAt: ago(1, 2),
    reportedBy: { id: "user-cust-07", fullName: "Saima Khalid", role: "CUSTOMER", phone: "+923334567890" },
    assignedAdmin: null,
    events: [],
  },
  {
    id: "inc-0004",
    visitId: "visit-2101",
    reportedById: "user-cust-02",
    source: "CUSTOMER_COMPLAINT",
    description: "Caregiver asked for extra cash payment outside the app.",
    priority: "HIGH",
    status: "IN_REVIEW",
    assignedAdminId: MOCK_ADMIN.id,
    resolvedAt: null,
    createdAt: ago(3),
    updatedAt: ago(2),
    reportedBy: { id: "user-cust-02", fullName: "Omar Farooq", role: "CUSTOMER", phone: "+923001112233" },
    assignedAdmin: { id: MOCK_ADMIN.id, fullName: MOCK_ADMIN.fullName },
    events: [
      { id: "ev-2", incidentId: "inc-0004", actorId: MOCK_ADMIN.id, action: "priority:MEDIUM->HIGH", note: "Second report against same caregiver this month.", at: ago(2, 20) },
      { id: "ev-3", incidentId: "inc-0004", actorId: MOCK_ADMIN.id, action: "status:OPEN->IN_REVIEW", note: null, at: ago(2) },
    ],
  },
  {
    id: "inc-0005",
    visitId: null,
    reportedById: cg(8).userId,
    source: "CAREGIVER_REPORT",
    description: "Gate guard refused entry to the housing society; address pin was also wrong.",
    priority: "LOW",
    status: "RESOLVED",
    assignedAdminId: MOCK_ADMIN.id,
    resolvedAt: ago(5),
    createdAt: ago(6),
    updatedAt: ago(5),
    reportedBy: { id: cg(8).userId, fullName: cg(8).user.fullName, role: "CAREGIVER", phone: cg(8).user.phone },
    assignedAdmin: { id: MOCK_ADMIN.id, fullName: MOCK_ADMIN.fullName },
    events: [
      { id: "ev-4", incidentId: "inc-0005", actorId: MOCK_ADMIN.id, action: "status:OPEN->RESOLVED", note: "Customer updated the map pin and added gate instructions.", at: ago(5) },
    ],
  },
];

export const disputes: Dispute[] = [
  {
    id: "dsp-0001",
    visitId: "visit-2150",
    raisedById: "user-cust-07",
    againstUserId: cg(6).userId,
    description: "Physiotherapy session was cut short to 25 minutes but full fee was charged.",
    status: "OPEN",
    resolutionNote: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: ago(1, 6),
    updatedAt: ago(1, 6),
    raisedBy: { id: "user-cust-07", fullName: "Saima Khalid", role: "CUSTOMER" },
    againstUser: { id: cg(6).userId, fullName: cg(6).user.fullName, role: "CAREGIVER" },
    visit: { id: "visit-2150", bookingId: "bk-0981", status: "COMPLETED" },
  },
  {
    id: "dsp-0002",
    visitId: "visit-2133",
    raisedById: cg(9).userId,
    againstUserId: "user-cust-04",
    description: "Customer cancelled at the door after I travelled 40 minutes; requesting a travel fee.",
    status: "OPEN",
    resolutionNote: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: ago(2, 1),
    updatedAt: ago(2, 1),
    raisedBy: { id: cg(9).userId, fullName: cg(9).user.fullName, role: "CAREGIVER" },
    againstUser: { id: "user-cust-04", fullName: "Bushra Nadeem", role: "CUSTOMER" },
    visit: { id: "visit-2133", bookingId: "bk-0975", status: "CANCELLED" },
  },
  {
    id: "dsp-0003",
    visitId: "visit-2080",
    raisedById: "user-cust-02",
    againstUserId: cg(14).userId,
    description: "Visit marked completed but the caregiver never checked in.",
    status: "OPEN",
    resolutionNote: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: ago(4),
    updatedAt: ago(4),
    raisedBy: { id: "user-cust-02", fullName: "Omar Farooq", role: "CUSTOMER" },
    againstUser: { id: cg(14).userId, fullName: cg(14).user.fullName, role: "CAREGIVER" },
    visit: { id: "visit-2080", bookingId: "bk-0930", status: "COMPLETED" },
  },
  {
    id: "dsp-0004",
    visitId: "visit-1990",
    raisedById: "user-cust-09",
    againstUserId: cg(5).userId,
    description: "Charged for two visits on the same day in a recurring booking.",
    status: "RESOLVED",
    resolutionNote: "Duplicate visit confirmed from status history. Second payment refunded to customer's JazzCash wallet.",
    resolvedById: MOCK_ADMIN.id,
    resolvedAt: ago(8),
    createdAt: ago(10),
    updatedAt: ago(8),
    raisedBy: { id: "user-cust-09", fullName: "Rizwan Ahmed", role: "CUSTOMER" },
    againstUser: { id: cg(5).userId, fullName: cg(5).user.fullName, role: "CAREGIVER" },
    visit: { id: "visit-1990", bookingId: "bk-0880", status: "COMPLETED" },
  },
];

function account(i: number, type: "BANK" | "MOBILE_WALLET") {
  const c = cg(i);
  return {
    id: `pa-${c.id}`,
    caregiverId: c.id,
    type,
    provider: type === "BANK" ? ["Meezan Bank", "HBL", "UBL"][i % 3] : ["JazzCash", "Easypaisa"][i % 2],
    accountTitle: c.user.fullName,
    accountNumber: `******${String(4000 + i * 137).slice(-4)}`,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  } as const;
}

function payout(id: string, i: number, amountRs: number, status: AdminPayoutRequest["status"], requestedDaysAgo: number, type: "BANK" | "MOBILE_WALLET"): AdminPayoutRequest {
  const c = cg(i);
  return {
    id,
    caregiverId: c.id,
    payoutAccountId: `pa-${c.id}`,
    amount: amountRs * 100,
    status,
    requestedAt: ago(requestedDaysAgo),
    processedAt: status === "PAID" || status === "REJECTED" ? ago(requestedDaysAgo - 1) : null,
    caregiver: { id: c.id, specialty: c.specialty, user: { fullName: c.user.fullName, phone: c.user.phone } },
    payoutAccount: { ...account(i, type) },
  };
}

export const payouts: AdminPayoutRequest[] = [
  payout("po-0001", 5, 48_400, "REQUESTED", 0.5, "BANK"),
  payout("po-0002", 10, 72_250, "REQUESTED", 1, "BANK"),
  payout("po-0003", 8, 15_840, "REQUESTED", 1.5, "MOBILE_WALLET"),
  payout("po-0004", 6, 36_100, "PROCESSING", 2, "BANK"),
  payout("po-0005", 7, 29_750, "PROCESSING", 3, "MOBILE_WALLET"),
  payout("po-0006", 5, 51_000, "PAID", 15, "BANK"),
  payout("po-0007", 9, 12_600, "PAID", 16, "MOBILE_WALLET"),
  payout("po-0008", 14, 8_200, "REJECTED", 12, "MOBILE_WALLET"),
];

export const promos: PromoCode[] = [
  { id: "promo-1", code: "WELCOME10", discountType: "PERCENT", discountValue: 10, validFrom: ago(60), validTo: ahead(120), maxUses: 1000, usesCount: 342, active: true, createdAt: ago(60), updatedAt: ago(60) },
  { id: "promo-2", code: "ELDERCARE500", discountType: "FIXED", discountValue: 500_00, validFrom: ago(20), validTo: ahead(40), maxUses: 300, usesCount: 88, active: true, createdAt: ago(20), updatedAt: ago(20) },
  { id: "promo-3", code: "RAMZAN15", discountType: "PERCENT", discountValue: 15, validFrom: ago(200), validTo: ago(170), maxUses: null, usesCount: 615, active: false, createdAt: ago(200), updatedAt: ago(170) },
  { id: "promo-4", code: "PHYSIO20", discountType: "PERCENT", discountValue: 20, validFrom: ahead(5), validTo: ahead(35), maxUses: 200, usesCount: 0, active: true, createdAt: ago(1), updatedAt: ago(1) },
];

export const platformConfig: PlatformConfigItem[] = [
  { key: "booking.respondWindowMinutes", envVar: "BOOKING_RESPOND_WINDOW_MINUTES", envDefault: 60, description: "Minutes a caregiver has to accept or decline a booking request (FR-CG5).", value: 45, overridden: true },
  { key: "booking.cancelNoticeMinutes", envVar: "BOOKING_CANCEL_NOTICE_MINUTES", envDefault: 0, description: "Minimum notice (minutes) before the visit start within which a customer cannot cancel (FR-C13).", value: 120, overridden: true },
  { key: "otp.ttlSeconds", envVar: "OTP_TTL_SECONDS", envDefault: 300, description: "Login OTP lifetime in seconds.", value: 300, overridden: false },
  { key: "otp.checkinTtlSeconds", envVar: "CHECKIN_OTP_TTL_SECONDS", envDefault: 600, description: "Visit check-in OTP lifetime in seconds (FR-CG7).", value: 600, overridden: false },
  { key: "retention.notificationDays", envVar: "RETENTION_NOTIFICATION_DAYS", envDefault: 90, description: "Days to keep delivered notifications before cleanup.", value: 90, overridden: false },
  { key: "search.cacheTtlSeconds", envVar: "SEARCH_CACHE_TTL_SECONDS", envDefault: 30, description: "Redis TTL for cached public caregiver search results.", value: 30, overridden: false },
];
