/**
 * In-memory implementation of the caregiver API. Mirrors the backend's rules
 * and exact error messages (see the caregiver API contract) so the UI
 * handles the same failures it will meet against the real server.
 */
import { ApiError } from "@shared/api/http";
import { decodeToken } from "@shared/api/session";
import type {
  Availability,
  AvailabilityRuleInput,
  BookingDetail,
  CaregiverBookingListItem,
  CaregiverPaymentRow,
  CaregiverPayoutRequest,
  CaregiverProfileRow,
  CaregiverVisitDetail,
  CaregiverVisitListItem,
  CheckInInput,
  DisputeRow,
  Earnings,
  Me,
  MyCaregiverProfile,
  PayoutAccountInput,
  RegisterCaregiverInput,
  SafetyIncidentRow,
  SosInput,
  SosResult,
  UpdateCaregiverProfileInput,
  Visit,
  CaregiverBookingStatus,
  AppNotification,
} from "@shared/caregiver-types";
import { parsePkMobile } from "@shared/lib/phone";
import type { CaregiverDocument, DocType, IncidentPriority, PageQuery, Paginated, PayoutAccount, PayoutStatus, TokenPair, VisitStatus } from "@shared/types";
import { session } from "../api/session";
import { db, persist, uid, type MockUser } from "./db";

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));
const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();

const notFound = (message: string): never => {
  throw new ApiError(404, message);
};
const bad = (message: string): never => {
  throw new ApiError(400, message);
};

function paginate<T>(all: T[], q: PageQuery): Paginated<T> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return { items: clone(all.slice((page - 1) * limit, page * limit)), page, limit, total: all.length };
}

/* ---- Identity ------------------------------------------------------------ */

export const MOCK_OTP = "123456";

function fakeJwt(payload: object): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.mock-signature`;
}

function tokensFor(user: MockUser): TokenPair {
  return {
    accessToken: fakeJwt({ sub: user.id, role: user.role, phone: user.phone, type: "access" }),
    refreshToken: fakeJwt({ sub: user.id, role: user.role, phone: user.phone, type: "refresh" }),
  };
}

function currentUser(): MockUser {
  const token = session.get()?.accessToken;
  const payload = token ? decodeToken(token) : null;
  if (!payload) throw new ApiError(401, "Missing access token");
  return db().users.find((u) => u.id === payload.sub) ?? (() => { throw new ApiError(401, "Invalid or expired access token"); })();
}

/** Routes with @Roles('CAREGIVER') check the role inside the JWT, not the DB. */
function requireCaregiverToken() {
  const payload = decodeToken(session.get()?.accessToken ?? "");
  if (payload?.role !== "CAREGIVER") throw new ApiError(403, "Insufficient role");
}

function myProfile(): CaregiverProfileRow {
  const user = currentUser();
  return db().profiles.find((p) => p.userId === user.id) ?? notFound("Caregiver profile not found");
}

export async function requestOtp(phone: string) {
  await delay();
  const parsed = parsePkMobile(phone);
  if (!parsed.ok) bad(parsed.error);
  return { ttlSeconds: 300 };
}

export async function verifyOtp(phone: string, code: string): Promise<TokenPair> {
  await delay();
  if (code !== MOCK_OTP) throw new ApiError(401, "Invalid OTP");
  const d = db();
  let user = d.users.find((u) => u.phone === phone);
  if (!user) {
    // Backend auto-creates unknown numbers as CUSTOMER.
    user = { id: uid("user"), phone, role: "CUSTOMER", fullName: "", preferredLanguage: "EN", status: "ACTIVE", lastLoginAt: null, createdAt: nowIso() };
    d.users.push(user);
  }
  if (user.status !== "ACTIVE") throw new ApiError(403, "Account is not active");
  user.lastLoginAt = nowIso();
  persist();
  return tokensFor(user);
}

/** POST /auth/refresh — re-reads the role from the DB. */
export async function refresh(): Promise<TokenPair> {
  await delay(150);
  return tokensFor(currentUser());
}

export async function me(): Promise<Me> {
  await delay(200);
  const user = currentUser();
  const profile = db().profiles.find((p) => p.userId === user.id);
  return { ...clone(user), caregiverProfile: profile ? { id: profile.id, verificationStatus: profile.verificationStatus } : null };
}

export async function updateMe(dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) {
  await delay();
  const user = currentUser();
  if (dto.fullName !== undefined) {
    if (dto.fullName.length < 1 || dto.fullName.length > 120) bad("fullName must be between 1 and 120 characters");
    user.fullName = dto.fullName;
  }
  if (dto.preferredLanguage) user.preferredLanguage = dto.preferredLanguage;
  persist();
  return { id: user.id, phone: user.phone, fullName: user.fullName, preferredLanguage: user.preferredLanguage };
}

/* ---- Profile & onboarding ------------------------------------------------- */

export async function register(dto: RegisterCaregiverInput): Promise<CaregiverProfileRow> {
  await delay(500);
  const user = currentUser();
  const d = db();
  if (d.profiles.some((p) => p.userId === user.id)) notFound("Caregiver profile already exists");
  if (dto.cnic.length !== 15) bad("cnic must be longer than or equal to 15 characters");
  if (dto.ratePerVisit < 1000) bad("ratePerVisit must not be less than 1000");
  const profile: CaregiverProfileRow = {
    id: uid("cg"),
    userId: user.id,
    cnic: `${"*".repeat(11)}${dto.cnic.slice(-4)}`,
    licenseNumber: dto.licenseNumber,
    licenseBody: dto.licenseBody,
    specialty: dto.specialty,
    experienceYears: dto.experienceYears ?? null,
    bio: dto.bio ?? null,
    photoKey: null,
    serviceArea: { cities: dto.serviceCities },
    ratePerVisit: dto.ratePerVisit,
    commissionRateId: `cr-${dto.specialty.toLowerCase()}`,
    verificationStatus: "PENDING",
    approvedAt: null,
    reverifyDueAt: null,
    ratingAverage: "0",
    ratingCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  d.profiles.push(profile);
  d.availability[profile.id] = { rules: [], blocks: [] };
  user.role = "CAREGIVER";
  persist();
  return clone(profile);
}

const COMMISSION: Record<string, string> = { NURSING: "20.00", PHYSIOTHERAPY: "20.00", POST_SURGERY_CARE: "20.00", ELDERLY_CARE: "20.00" };

export async function getProfile(): Promise<MyCaregiverProfile> {
  await delay(200);
  const p = myProfile();
  const d = db();
  return clone({
    ...p,
    documents: d.documents.filter((x) => x.caregiverId === p.id),
    credentialReviews: d.reviewsOfCredentials.filter((r) => r.caregiverId === p.id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).slice(0, 5),
    commissionRate: { id: p.commissionRateId, category: p.specialty, percentage: COMMISSION[p.specialty], effectiveFrom: p.createdAt, createdAt: p.createdAt, updatedAt: p.createdAt },
  });
}

export async function updateProfile(dto: UpdateCaregiverProfileInput): Promise<CaregiverProfileRow> {
  await delay();
  const p = myProfile();
  if (dto.ratePerVisit !== undefined && dto.ratePerVisit < 1000) bad("ratePerVisit must not be less than 1000");
  if (dto.experienceYears !== undefined && (dto.experienceYears < 0 || dto.experienceYears > 60)) bad("experienceYears must not be greater than 60");
  if (dto.bio !== undefined && dto.bio.length > 2000) bad("bio must be shorter than or equal to 2000 characters");
  if (dto.specialty) {
    p.specialty = dto.specialty;
    p.commissionRateId = `cr-${dto.specialty.toLowerCase()}`;
  }
  if (dto.ratePerVisit !== undefined) p.ratePerVisit = dto.ratePerVisit;
  if (dto.serviceCities) p.serviceArea = { cities: dto.serviceCities };
  if (dto.bio !== undefined) p.bio = dto.bio;
  if (dto.experienceYears !== undefined) p.experienceYears = dto.experienceYears;
  p.updatedAt = nowIso();
  persist();
  return clone(p);
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function checkUpload(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "File too large");
  if (!ALLOWED_MIME.includes(file.type)) bad("Only JPEG, PNG, WEBP or PDF files are allowed");
}

export async function uploadDocument(file: File, type: DocType): Promise<CaregiverDocument> {
  await delay(700);
  const p = myProfile();
  checkUpload(file);
  const doc: CaregiverDocument = {
    id: uid("doc"),
    caregiverId: p.id,
    type,
    fileKey: `caresaath/caregivers/${p.id}/${file.name}`,
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: nowIso(),
  };
  db().documents.push(doc);
  persist();
  return clone(doc);
}

export async function uploadPhoto(file: File): Promise<{ photoKey: string }> {
  await delay(600);
  const p = myProfile();
  checkUpload(file);
  p.photoKey = `caresaath/caregivers/${p.id}/photo`;
  persist();
  return { photoKey: p.photoKey };
}

export async function photoUrl(): Promise<{ url: string }> {
  await delay(200);
  const p = myProfile();
  if (!p.photoKey) notFound("No photo uploaded");
  const user = currentUser();
  const initials = (user.fullName || "CG").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#167267"/><circle cx="120" cy="96" r="44" fill="#edf8f6"/><rect x="52" y="152" width="136" height="88" rx="60" fill="#edf8f6"/><text x="120" y="110" font-family="sans-serif" font-size="34" font-weight="700" fill="#135c54" text-anchor="middle">${initials}</text></svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}

function sampleSvg(title: string, lines: string[]): string {
  const body = lines.map((l, i) => `<text x="70" y="${250 + i * 46}">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100"><rect width="850" height="1100" fill="#fbfcfc"/><rect x="40" y="40" width="770" height="1020" fill="none" stroke="#167267" stroke-width="3"/><rect x="40" y="40" width="770" height="120" fill="#edf8f6"/><text x="425" y="95" font-family="sans-serif" font-size="30" font-weight="700" fill="#135c54" text-anchor="middle">${title}</text><text x="425" y="135" font-family="sans-serif" font-size="18" fill="#4b5754" text-anchor="middle">Sample document · mock data</text><g font-family="sans-serif" font-size="22" fill="#242c2a">${body}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function documentUrl(id: string): Promise<{ url: string }> {
  await delay(200);
  const p = myProfile();
  const doc = db().documents.find((x) => x.id === id && x.caregiverId === p.id) ?? notFound("Document not found");
  return { url: sampleSvg(doc.type.replace("_", " "), [`License: ${p.licenseNumber}`, `Body: ${p.licenseBody}`, `Uploaded: ${doc.createdAt.slice(0, 10)}`]) };
}

/* ---- Availability ---------------------------------------------------------- */

export async function getAvailability(): Promise<Availability> {
  await delay(200);
  const p = myProfile();
  const a = db().availability[p.id] ?? { rules: [], blocks: [] };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return clone({
    rules: [...a.rules].sort((x, y) => x.dayOfWeek - y.dayOfWeek || x.startTime.localeCompare(y.startTime)),
    blocks: a.blocks.filter((b) => new Date(b.endDate.slice(0, 10) + "T23:59:59") >= today).sort((x, y) => x.startDate.localeCompare(y.startDate)),
  });
}

export async function putAvailability(rules: AvailabilityRuleInput[]): Promise<Availability> {
  await delay();
  const p = myProfile();
  for (const r of rules) {
    if (r.startTime >= r.endTime) notFound(`Invalid window for day ${r.dayOfWeek}: start must be before end`);
  }
  const a = (db().availability[p.id] ??= { rules: [], blocks: [] });
  a.rules = rules.map((r) => ({ ...r, id: uid("ar"), caregiverId: p.id }));
  persist();
  return getAvailability();
}

export async function addBlock(dto: { startDate: string; endDate: string; reason?: string }) {
  await delay();
  const p = myProfile();
  if (dto.endDate < dto.startDate) notFound("endDate must be on or after startDate");
  const block = { id: uid("blk"), caregiverId: p.id, startDate: `${dto.startDate}T00:00:00.000Z`, endDate: `${dto.endDate}T00:00:00.000Z`, reason: dto.reason ?? null, createdAt: nowIso() };
  (db().availability[p.id] ??= { rules: [], blocks: [] }).blocks.push(block);
  persist();
  return clone(block);
}

export async function deleteBlock(id: string) {
  await delay();
  const p = myProfile();
  const a = db().availability[p.id];
  if (!a?.blocks.some((b) => b.id === id)) notFound("Block not found");
  a.blocks = a.blocks.filter((b) => b.id !== id);
  persist();
  return { ok: true as const };
}

/* ---- Bookings ---------------------------------------------------------------- */

function bookingRelations(bookingId: string) {
  const d = db();
  const b = d.bookings.find((x) => x.id === bookingId)!;
  const patient = d.patients.find((x) => x.id === b.patientId)!;
  return {
    b,
    patient,
    address: d.addresses.find((x) => x.id === b.addressId)!,
    visits: d.visits.filter((v) => v.bookingId === b.id).sort((x, y) => x.scheduledDate.localeCompare(y.scheduledDate)),
    prescriptions: d.prescriptions.filter((x) => x.bookingId === b.id),
  };
}

function bookingDetail(bookingId: string): BookingDetail {
  const r = bookingRelations(bookingId);
  const p = db().profiles.find((x) => x.id === r.b.caregiverId)!;
  return clone({
    ...r.b,
    visits: r.visits,
    patient: { id: r.patient.id, name: r.patient.name, relationship: r.patient.relationship },
    address: r.address,
    caregiver: { id: p.id, specialty: p.specialty, userId: p.userId },
    prescriptions: r.prescriptions
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map(({ id, mimeType, sizeBytes, createdAt, uploadedById }) => ({ id, mimeType, sizeBytes, createdAt, uploadedById })),
  });
}

export async function listBookings(q: PageQuery & { status?: CaregiverBookingStatus }): Promise<Paginated<CaregiverBookingListItem>> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const rows = db()
    .bookings.filter((b) => b.caregiverId === p.id && (!q.status || b.status === q.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => {
      const r = bookingRelations(b.id);
      return { ...b, patient: { id: r.patient.id, name: r.patient.name, relationship: r.patient.relationship }, address: r.address, visits: r.visits };
    });
  return paginate(rows, q);
}

function notifyCustomer() {
  // Customer notifications aren't visible in the caregiver app; nothing to store.
}

export async function acceptBooking(id: string): Promise<BookingDetail> {
  await delay(450);
  requireCaregiverToken();
  const p = myProfile();
  const b = db().bookings.find((x) => x.id === id && x.caregiverId === p.id) ?? notFound("Booking not found");
  if (b.status !== "REQUESTED") bad("Only requested bookings can be accepted");
  b.status = "CONFIRMED";
  b.updatedAt = nowIso();
  db().visits.filter((v) => v.bookingId === id && v.status === "REQUESTED").forEach((v) => {
    v.status = "CONFIRMED";
    v.updatedAt = nowIso();
  });
  notifyCustomer();
  persist();
  return bookingDetail(id);
}

export async function declineBooking(id: string, reason?: string): Promise<BookingDetail> {
  await delay(450);
  requireCaregiverToken();
  const p = myProfile();
  if (reason && reason.length > 500) bad("reason must be shorter than or equal to 500 characters");
  const b = db().bookings.find((x) => x.id === id && x.caregiverId === p.id) ?? notFound("Booking not found");
  if (b.status !== "REQUESTED") bad("Only requested bookings can be declined");
  b.status = "DECLINED";
  b.cancelledAt = nowIso();
  b.cancelledById = p.userId;
  b.cancelReason = reason ?? null;
  db().visits.filter((v) => v.bookingId === id && (v.status === "REQUESTED" || v.status === "CONFIRMED")).forEach((v) => {
    v.status = "DECLINED";
    v.updatedAt = nowIso();
  });
  persist();
  return bookingDetail(id);
}

export async function prescriptionUrl(bookingId: string, documentId: string): Promise<{ url: string; mimeType: string }> {
  await delay(200);
  const p = myProfile();
  const b = db().bookings.find((x) => x.id === bookingId && x.caregiverId === p.id) ?? notFound("Booking not found");
  const rx = db().prescriptions.find((x) => x.id === documentId && x.bookingId === b.id) ?? notFound("Prescription not found");
  const patient = db().patients.find((x) => x.id === b.patientId)!;
  return {
    url: sampleSvg("PRESCRIPTION", [`Patient: ${patient.name}`, ...(patient.medicalContext ?? "").match(/.{1,52}(\s|$)/g)!.slice(0, 8).map((s) => s.trim())]),
    mimeType: rx.mimeType === "application/pdf" ? "image/svg+xml" : "image/svg+xml",
  };
}

/* ---- Visits ------------------------------------------------------------------ */

const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  REQUESTED: ["CONFIRMED", "DECLINED", "CANCELLED"],
  CONFIRMED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["CHECKED_IN"],
  CHECKED_IN: ["IN_PROGRESS"],
  IN_PROGRESS: ["CHECKED_OUT"],
  CHECKED_OUT: ["COMPLETED"],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
};

function myVisit(id: string): Visit {
  const p = myProfile();
  const v = db().visits.find((x) => x.id === id);
  const b = v && db().bookings.find((x) => x.id === v.bookingId);
  if (!v || !b || b.caregiverId !== p.id) notFound("Visit not found");
  return v!;
}

function transition(v: Visit, to: VisitStatus) {
  if (!TRANSITIONS[v.status].includes(to)) bad(`Cannot move visit from ${v.status} to ${to}`);
  db().history.push({ id: uid("h"), visitId: v.id, fromStatus: v.status, toStatus: to, actorId: currentUser().id, at: nowIso() });
  v.status = to;
  v.updatedAt = nowIso();
}

function visitDetail(id: string): CaregiverVisitDetail {
  const d = db();
  const v = d.visits.find((x) => x.id === id)!;
  const r = bookingRelations(v.bookingId);
  return clone({
    ...v,
    booking: { ...r.b, patient: r.patient, address: r.address, prescriptions: r.prescriptions, customer: d.customers.find((c) => c.id === r.b.customerId)! },
    statusHistory: d.history.filter((h) => h.visitId === id).sort((a, b) => a.at.localeCompare(b.at)),
    note: d.notes.find((n) => n.visitId === id) ?? null,
    review: d.reviews.find((x) => x.visitId === id) ?? null,
    // Proposed field — the real API doesn't include payments yet (see caregiver-types).
    payments: d.payments
      .filter((x) => x.visitId === id)
      .map(({ id: pid, method, status, amount, caregiverAmount, paidAt }) => ({ id: pid, method, status, amount, caregiverAmount, paidAt })),
  });
}

export async function listVisits(q: PageQuery & { status?: VisitStatus }): Promise<Paginated<CaregiverVisitListItem>> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  const mine = new Set(d.bookings.filter((b) => b.caregiverId === p.id).map((b) => b.id));
  const rows = d.visits
    .filter((v) => mine.has(v.bookingId) && (!q.status || v.status === q.status))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.timeWindowStart.localeCompare(b.timeWindowStart))
    .map((v) => {
      const r = bookingRelations(v.bookingId);
      return { ...v, booking: { ...r.b, patient: { name: r.patient.name, relationship: r.patient.relationship }, address: r.address } };
    });
  return paginate(rows, q);
}

export async function getVisit(id: string): Promise<CaregiverVisitDetail> {
  await delay(250);
  requireCaregiverToken();
  myVisit(id);
  return visitDetail(id);
}

export async function enRoute(id: string): Promise<Visit> {
  await delay(400);
  requireCaregiverToken();
  const v = myVisit(id);
  transition(v, "EN_ROUTE");
  v.enRouteAt = nowIso();
  persist();
  return clone(v);
}

export async function checkInOtp(id: string): Promise<{ ttlSeconds: number; sentTo: string }> {
  await delay(400);
  requireCaregiverToken();
  const v = myVisit(id);
  if (v.status !== "CONFIRMED" && v.status !== "EN_ROUTE") bad(`A check-in OTP can only be issued for a confirmed or en-route visit (now ${v.status})`);
  db().checkinOtps[id] = { code: MOCK_OTP, expiresAt: Date.now() + 600_000, attempts: 0 };
  persist();
  const b = db().bookings.find((x) => x.id === v.bookingId)!;
  return { ttlSeconds: 600, sentTo: db().customers.find((c) => c.id === b.customerId)!.phone };
}

export async function checkIn(id: string, dto: CheckInInput): Promise<Visit> {
  await delay(450);
  requireCaregiverToken();
  const method = dto.method ?? "GPS";
  if (method === "GPS" && (dto.lat === undefined || dto.lng === undefined)) bad("GPS check-in requires lat and lng");
  if (method === "OTP") {
    const otp = db().checkinOtps[id];
    if (!otp || otp.expiresAt < Date.now()) throw new ApiError(401, "Check-in OTP expired or not requested");
    otp.attempts += 1;
    if (otp.attempts > 5) {
      delete db().checkinOtps[id];
      persist();
      throw new ApiError(401, "Too many attempts, request a new OTP");
    }
    if (otp.code !== dto.code) {
      persist();
      throw new ApiError(401, "Invalid check-in OTP");
    }
    // Consumed before the state check, like the backend.
    delete db().checkinOtps[id];
  }
  const v = myVisit(id);
  transition(v, "CHECKED_IN");
  v.checkInAt = nowIso();
  v.checkInMethod = method;
  v.checkInLat = dto.lat !== undefined ? dto.lat.toFixed(6) : null;
  v.checkInLng = dto.lng !== undefined ? dto.lng.toFixed(6) : null;
  persist();
  return clone(v);
}

export async function checkOut(id: string, dto: CheckInInput): Promise<Visit> {
  await delay(450);
  requireCaregiverToken();
  const v = myVisit(id);
  if (v.status === "CHECKED_IN") transition(v, "IN_PROGRESS");
  const method = dto.method ?? "GPS";
  if (method === "GPS" && (dto.lat === undefined || dto.lng === undefined)) {
    persist();
    bad("GPS check-out requires lat and lng");
  }
  transition(v, "CHECKED_OUT");
  v.checkOutAt = nowIso();
  v.checkOutMethod = method;
  v.checkOutLat = dto.lat !== undefined ? dto.lat.toFixed(6) : null;
  v.checkOutLng = dto.lng !== undefined ? dto.lng.toFixed(6) : null;
  persist();
  return clone(v);
}

export async function submitNote(id: string, summary: string): Promise<CaregiverVisitDetail> {
  await delay(450);
  requireCaregiverToken();
  if (summary.trim().length < 1) bad("summary must be longer than or equal to 1 characters");
  if (summary.length > 4000) bad("summary must be shorter than or equal to 4000 characters");
  const v = myVisit(id);
  if (db().notes.some((n) => n.visitId === id)) bad("A note has already been submitted for this visit");
  transition(v, "COMPLETED");
  db().notes.push({ id: uid("note"), visitId: id, caregiverId: myProfile().id, summary, submittedAt: nowIso() });
  persist();
  return visitDetail(id);
}

/* ---- Payments -------------------------------------------------------------------- */

export async function confirmCash(paymentId: string): Promise<CaregiverPaymentRow> {
  await delay(400);
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  const pay = d.payments.find((x) => x.id === paymentId);
  const b = pay && d.bookings.find((x) => x.id === d.visits.find((v) => v.id === pay.visitId)?.bookingId);
  if (!pay || !b || b.caregiverId !== p.id) return notFound("Payment not found");
  if (pay.method !== "CASH") bad("Only cash payments are confirmed this way");
  if (pay.status !== "PAID") {
    if (pay.status !== "PENDING") bad(`Cannot settle a payment in ${pay.status} state`);
    pay.status = "PAID";
    pay.paidAt = nowIso();
    persist();
  }
  return clone({ ...pay, gatewayRef: null, updatedAt: pay.paidAt ?? pay.createdAt });
}

/* ---- Earnings & payouts --------------------------------------------------------- */

function myPayments() {
  const p = myProfile();
  const d = db();
  const mineVisits = new Set(d.visits.filter((v) => d.bookings.find((b) => b.id === v.bookingId)?.caregiverId === p.id).map((v) => v.id));
  return d.payments.filter((x) => mineVisits.has(x.visitId) || (p.id === "cg-fatima" && x.visitId.startsWith("vs-hist")));
}

export async function earnings(): Promise<Earnings> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  const paid = myPayments().filter((x) => x.status === "PAID");
  const open = new Set(d.payouts.filter((x) => x.caregiverId === p.id && (x.status === "REQUESTED" || x.status === "PROCESSING")).map((x) => x.id));
  const available = paid.filter((x) => !x.payoutRequestId);
  const pending = paid.filter((x) => x.payoutRequestId && open.has(x.payoutRequestId));
  const sum = (xs: typeof paid, k: "caregiverAmount" | "commissionAmount") => xs.reduce((a, b) => a + b[k], 0);
  return {
    availableAmount: sum(available, "caregiverAmount"),
    availableCount: available.length,
    pendingAmount: sum(pending, "caregiverAmount"),
    pendingCount: pending.length,
    lifetimeEarnings: sum(paid, "caregiverAmount"),
    lifetimeCommission: sum(paid, "commissionAmount"),
    lifetimeVisits: paid.length,
    recentPayoutRequests: clone(d.payouts.filter((x) => x.caregiverId === p.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 20)),
  };
}

const view = ({ fullNumber: _fullNumber, ...a }: PayoutAccount & { fullNumber: string }): PayoutAccount => {
  void _fullNumber;
  return clone(a);
};

export async function listPayoutAccounts(): Promise<PayoutAccount[]> {
  await delay(200);
  requireCaregiverToken();
  const p = myProfile();
  return db().payoutAccounts.filter((a) => a.caregiverId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view);
}

function validateAccount(dto: Partial<PayoutAccountInput>) {
  if (dto.provider !== undefined && (dto.provider.length < 2 || dto.provider.length > 80)) bad("provider must be longer than or equal to 2 characters");
  if (dto.accountTitle !== undefined && (dto.accountTitle.length < 2 || dto.accountTitle.length > 120)) bad("accountTitle must be longer than or equal to 2 characters");
  if (dto.accountNumber !== undefined && (dto.accountNumber.length < 4 || dto.accountNumber.length > 40)) bad("accountNumber must be longer than or equal to 4 characters");
}

export async function createPayoutAccount(dto: PayoutAccountInput): Promise<PayoutAccount> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  validateAccount(dto);
  const acc = { id: uid("pa"), caregiverId: p.id, ...dto, accountNumber: `****${dto.accountNumber.slice(-4)}`, fullNumber: dto.accountNumber, createdAt: nowIso(), updatedAt: nowIso() };
  db().payoutAccounts.push(acc);
  persist();
  return view(acc);
}

export async function updatePayoutAccount(id: string, dto: Partial<PayoutAccountInput>): Promise<PayoutAccount> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const acc = db().payoutAccounts.find((a) => a.id === id && a.caregiverId === p.id) ?? notFound("Payout account not found");
  validateAccount(dto);
  if (dto.type) acc.type = dto.type;
  if (dto.provider) acc.provider = dto.provider;
  if (dto.accountTitle) acc.accountTitle = dto.accountTitle;
  if (dto.accountNumber) {
    acc.fullNumber = dto.accountNumber;
    acc.accountNumber = `****${dto.accountNumber.slice(-4)}`;
  }
  acc.updatedAt = nowIso();
  persist();
  return view(acc);
}

export async function deletePayoutAccount(id: string) {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  if (!d.payoutAccounts.some((a) => a.id === id && a.caregiverId === p.id)) notFound("Payout account not found");
  const used = d.payouts.filter((x) => x.payoutAccountId === id);
  if (used.some((x) => x.status === "REQUESTED" || x.status === "PROCESSING")) bad("Cannot remove an account with an in-progress payout");
  // Backend hits a FK constraint (500) for accounts with any payout history.
  if (used.length > 0) throw new ApiError(500, "Internal server error");
  d.payoutAccounts = d.payoutAccounts.filter((a) => a.id !== id);
  persist();
  return { ok: true as const };
}

export async function listPayouts(q: PageQuery & { status?: PayoutStatus }): Promise<Paginated<CaregiverPayoutRequest>> {
  await delay();
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  const rows = d.payouts
    .filter((x) => x.caregiverId === p.id && (!q.status || x.status === q.status))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((x) => ({ ...x, payoutAccount: view(d.payoutAccounts.find((a) => a.id === x.payoutAccountId)!) }));
  return paginate(rows, q);
}

export async function requestPayout(dto: { payoutAccountId: string; amount: number }) {
  await delay(500);
  requireCaregiverToken();
  const p = myProfile();
  const d = db();
  if (!d.payoutAccounts.some((a) => a.id === dto.payoutAccountId && a.caregiverId === p.id)) notFound("Payout account not found");
  if (!Number.isInteger(dto.amount) || dto.amount < 1) bad("amount must not be less than 1");
  const available = myPayments()
    .filter((x) => x.status === "PAID" && !x.payoutRequestId)
    .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
  const total = available.reduce((a, b) => a + b.caregiverAmount, 0);
  if (dto.amount > total) bad(`Requested amount exceeds available earnings (${total})`);
  const payout = { id: uid("po"), caregiverId: p.id, payoutAccountId: dto.payoutAccountId, amount: dto.amount, status: "REQUESTED" as const, requestedAt: nowIso(), processedAt: null };
  // Greedy, oldest first — may lock more than requested (backend behaviour).
  let locked = 0;
  for (const pay of available) {
    if (locked >= dto.amount) break;
    pay.payoutRequestId = payout.id;
    locked += pay.caregiverAmount;
  }
  d.payouts.push(payout);
  persist();
  return clone(payout);
}

/* ---- Safety, disputes, notifications -------------------------------------------- */

export async function listSafetyReports(): Promise<SafetyIncidentRow[]> {
  await delay(200);
  requireCaregiverToken();
  const user = currentUser();
  return clone(db().incidents.filter((i) => i.reportedById === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function createSafetyReport(dto: { visitId: string; description: string; priority?: IncidentPriority }): Promise<SafetyIncidentRow> {
  await delay(450);
  requireCaregiverToken();
  if (dto.description.trim().length < 3) bad("description must be longer than or equal to 3 characters");
  myVisit(dto.visitId);
  const inc: SafetyIncidentRow = { id: uid("inc"), visitId: dto.visitId, reportedById: currentUser().id, source: "CAREGIVER_REPORT", description: dto.description, priority: dto.priority ?? "MEDIUM", status: "OPEN", assignedAdminId: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  db().incidents.push(inc);
  persist();
  return clone(inc);
}

export async function sos(dto: SosInput): Promise<SosResult> {
  await delay(400);
  const v = myVisit(dto.visitId);
  if (["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status)) bad("SOS can only be raised during an active visit");
  const inc: SafetyIncidentRow = { id: uid("inc"), visitId: v.id, reportedById: currentUser().id, source: "SOS", description: dto.note || "SOS raised during visit", priority: "CRITICAL", status: "OPEN", assignedAdminId: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  db().incidents.push(inc);
  persist();
  return { incident: clone(inc), notifiedAdmins: 2, notifiedContacts: 1 };
}

export async function listDisputes(): Promise<DisputeRow[]> {
  await delay(200);
  const user = currentUser();
  return clone(db().disputes.filter((x) => x.raisedById === user.id || x.againstUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function raiseDispute(dto: { visitId: string; description: string }): Promise<DisputeRow> {
  await delay(450);
  if (dto.description.trim().length < 5) bad("description must be longer than or equal to 5 characters");
  const v = myVisit(dto.visitId);
  const user = currentUser();
  if (db().disputes.some((x) => x.visitId === v.id && x.raisedById === user.id && x.status === "OPEN")) bad("You already have an open dispute for this visit");
  const b = db().bookings.find((x) => x.id === v.bookingId)!;
  const dispute: DisputeRow = { id: uid("dsp"), visitId: v.id, raisedById: user.id, againstUserId: b.customerId, description: dto.description, status: "OPEN", resolutionNote: null, resolvedById: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  db().disputes.push(dispute);
  persist();
  return clone(dispute);
}

export async function listNotifications(q: PageQuery): Promise<Paginated<AppNotification>> {
  await delay(200);
  const user = currentUser();
  return paginate(db().notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), q);
}
