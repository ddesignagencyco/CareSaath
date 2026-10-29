/**
 * In-memory implementation of the admin API. Mirrors the backend's validation
 * rules (e.g. approve needs documents, payout state transitions) so the UI
 * exercises the same error paths it will meet against the real API.
 */
import { ApiError } from "../api/http";
import type {
  AdminCaregiver,
  AdminCaregiverRecord,
  AnalyticsOverview,
  AnalyticsRange,
  CommissionRate,
  CreatePromoInput,
  DisputeRecord,
  DisputeStatus,
  DocumentUrl,
  IncidentPriority,
  IncidentStatus,
  PageQuery,
  Paginated,
  PayoutStatus,
  PlatformConfigItem,
  PlatformConfigSetResult,
  PayoutRequestRecord,
  PromoCode,
  ReportType,
  ResolvePayoutInput,
  SafetyIncidentRecord,
  Specialty,
  TokenPair,
  UpdateIncidentInput,
  UpdatePromoInput,
  VerificationStatus,
} from "@shared/types";
import * as db from "./data";
import { parsePkMobile } from "@shared/lib/phone";

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));
const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();

function paginate<T>(all: T[], q: PageQuery): Paginated<T> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return { items: clone(all.slice((page - 1) * limit, page * limit)), page, limit, total: all.length };
}

function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`);
}

function bad(message: string): never {
  throw new ApiError(400, message);
}

/* ---- Auth -------------------------------------------------------------- */

export const MOCK_OTP = "123456";

function fakeJwt(payload: object): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.mock-signature`;
}

export async function requestOtp(phone: string): Promise<{ ttlSeconds: number }> {
  await delay();
  const parsed = parsePkMobile(phone);
  if (!parsed.ok) bad(parsed.error);
  return { ttlSeconds: 300 };
}

export async function verifyOtp(phone: string, code: string): Promise<TokenPair> {
  await delay();
  if (code !== MOCK_OTP) throw new ApiError(401, "Invalid OTP");
  return {
    accessToken: fakeJwt({ sub: db.MOCK_ADMIN.id, role: "ADMIN", phone, type: "access" }),
    refreshToken: fakeJwt({ sub: db.MOCK_ADMIN.id, role: "ADMIN", phone, type: "refresh" }),
  };
}

/* ---- Caregivers -------------------------------------------------------- */

function findCaregiver(id: string): AdminCaregiver {
  return db.caregivers.find((c) => c.id === id) ?? notFound("Caregiver");
}

/** Like the API, action routes return the profile + documents without `user`. */
function record(c: AdminCaregiver): AdminCaregiverRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped like the API does
  const { user, ...rest } = clone(c);
  return rest;
}

export async function listCaregivers(q: PageQuery & { status?: VerificationStatus }) {
  await delay();
  const rows = db.caregivers
    .filter((c) => !q.status || c.verificationStatus === q.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(rows, q);
}

export async function approveCaregiver(id: string): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  if (c.verificationStatus === "APPROVED") bad("Already approved");
  if (c.documents.length === 0) bad("No documents uploaded to review");
  const now = Date.now();
  c.verificationStatus = "APPROVED";
  c.approvedAt = new Date(now).toISOString();
  c.reverifyDueAt = new Date(now + 365 * 86_400_000).toISOString();
  c.updatedAt = nowIso();
  return record(c);
}

export async function rejectCaregiver(id: string): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  if (c.verificationStatus === "APPROVED") bad("Use suspend for an approved caregiver");
  c.verificationStatus = "REJECTED";
  c.updatedAt = nowIso();
  return record(c);
}

export async function reverifyCaregiver(id: string, reverifyInDays = 365): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  c.verificationStatus = "PENDING";
  c.approvedAt = null;
  c.reverifyDueAt = new Date(Date.now() + reverifyInDays * 86_400_000).toISOString();
  c.updatedAt = nowIso();
  return record(c);
}

export async function suspendCaregiver(id: string): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  c.verificationStatus = "SUSPENDED";
  c.updatedAt = nowIso();
  return record(c);
}

export async function reactivateCaregiver(id: string): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  // Same as the API today: only the user account is reactivated; a SUSPENDED
  // verification status stays SUSPENDED (see wire-admin notes).
  c.user.status = "ACTIVE";
  c.updatedAt = nowIso();
  return record(c);
}

export async function deactivateCaregiver(id: string): Promise<AdminCaregiverRecord> {
  await delay();
  const c = findCaregiver(id);
  c.user.status = "DEACTIVATED";
  c.updatedAt = nowIso();
  return record(c);
}

function sampleDocumentSvg(title: string, c: AdminCaregiver): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100">
  <rect width="850" height="1100" fill="#fbfcfc"/>
  <rect x="40" y="40" width="770" height="1020" fill="none" stroke="#167267" stroke-width="3"/>
  <rect x="40" y="40" width="770" height="120" fill="#edf8f6"/>
  <text x="425" y="95" font-family="sans-serif" font-size="30" font-weight="700" fill="#135c54" text-anchor="middle">${title.toUpperCase()}</text>
  <text x="425" y="135" font-family="sans-serif" font-size="18" fill="#4b5754" text-anchor="middle">Sample document · mock data</text>
  <g font-family="sans-serif" font-size="22" fill="#242c2a">
    <text x="90" y="260">Name: ${c.user.fullName}</text>
    <text x="90" y="310">Registration no: ${c.licenseNumber}</text>
    <text x="90" y="360">Issuing body: ${c.licenseBody}</text>
    <text x="90" y="410">CNIC: ${c.cnic}</text>
  </g>
  <text x="425" y="1000" font-family="sans-serif" font-size="16" fill="#85918e" text-anchor="middle">The real file is served by a short-lived signed Cloudinary URL.</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function caregiverDocumentUrl(id: string, documentId: string): Promise<DocumentUrl> {
  await delay(200);
  const c = findCaregiver(id);
  const doc = c.documents.find((d) => d.id === documentId) ?? notFound("Document");
  return { url: sampleDocumentSvg(doc.type.replace("_", " "), c), mimeType: "image/svg+xml" };
}

/* ---- Analytics & reports ------------------------------------------------ */

const RANGE_FACTOR: Record<AnalyticsRange, number> = { "7d": 0.24, "30d": 1, "90d": 2.7, all: 4.1 };

export async function analytics(range: AnalyticsRange = "30d"): Promise<AnalyticsOverview> {
  await delay();
  const f = RANGE_FACTOR[range];
  const n = (v: number) => Math.round(v * f);
  const byStatus = { REQUESTED: n(38), CONFIRMED: n(61), DECLINED: n(17), CANCELLED: n(29), COMPLETED: n(402) };
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const gross = n(1_384_500) * 100;
  return {
    range,
    bookings: { total, byStatus, cancellationRate: Number((byStatus.CANCELLED / total).toFixed(4)) },
    caregivers: {
      active: db.caregivers.filter((c) => c.verificationStatus === "APPROVED").length,
      pendingVerification: db.caregivers.filter((c) => c.verificationStatus === "PENDING").length,
    },
    payments: { paidCount: n(436), grossRevenue: gross, commissionRevenue: Math.round(gross * 0.152) },
    payouts: { paidOut: Math.round(gross * 0.71) },
    visits: { completed: n(518) },
  };
}

function toCsv(rows: unknown[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const v = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

export async function exportReport(type: ReportType): Promise<string> {
  await delay(600);
  switch (type) {
    case "caregivers":
      return toCsv([
        ["id", "fullName", "phone", "specialty", "verificationStatus", "ratePerVisit", "ratingAverage", "ratingCount", "createdAt"],
        ...db.caregivers.map((c) => [c.id, c.user.fullName, c.user.phone, c.specialty, c.verificationStatus, c.ratePerVisit, c.ratingAverage, c.ratingCount, c.createdAt]),
      ]);
    case "payouts":
      return toCsv([
        ["id", "caregiverId", "payoutAccountId", "amount", "status", "requestedAt", "processedAt"],
        ...db.payouts.map((p) => [p.id, p.caregiverId, p.payoutAccountId, p.amount, p.status, p.requestedAt, p.processedAt ?? ""]),
      ]);
    case "payments":
      return toCsv([["id", "visitId", "method", "status", "amount", "commissionAmount", "caregiverAmount", "paidAt", "createdAt"]]);
    case "bookings":
      return toCsv([["id", "customerId", "caregiverId", "serviceType", "status", "rateSnapshot", "discountAmount", "startDate", "endDate"]]);
  }
}

/* ---- Safety incidents --------------------------------------------------- */

export async function listIncidents(q: PageQuery & { status?: IncidentStatus; priority?: IncidentPriority }) {
  await delay();
  const rows = db.incidents
    .filter((i) => (!q.status || i.status === q.status) && (!q.priority || i.priority === q.priority))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return paginate(rows, q);
}

export async function updateIncident(id: string, dto: UpdateIncidentInput): Promise<SafetyIncidentRecord> {
  await delay();
  const inc = db.incidents.find((i) => i.id === id) ?? notFound("Safety incident");
  if (!dto.status && !dto.priority && !dto.note) bad("Provide a status, priority or note to update");
  const changes: string[] = [];
  if (dto.status && dto.status !== inc.status) changes.push(`status:${inc.status}->${dto.status}`);
  if (dto.priority && dto.priority !== inc.priority) changes.push(`priority:${inc.priority}->${dto.priority}`);
  if (dto.status) inc.status = dto.status;
  if (dto.priority) inc.priority = dto.priority;
  if (dto.status === "RESOLVED") inc.resolvedAt = nowIso();
  if (!inc.assignedAdminId) {
    inc.assignedAdminId = db.MOCK_ADMIN.id;
    inc.assignedAdmin = { id: db.MOCK_ADMIN.id, fullName: db.MOCK_ADMIN.fullName };
  }
  inc.updatedAt = nowIso();
  inc.events.push({
    id: `ev-${Date.now()}`,
    incidentId: id,
    actorId: db.MOCK_ADMIN.id,
    action: changes.length > 0 ? changes.join(",") : "note",
    note: dto.note ?? null,
    at: nowIso(),
  });
  // The API returns the bare row, without reportedBy/assignedAdmin/events.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped like the API does
  const { reportedBy, assignedAdmin, events, ...row } = clone(inc);
  return row;
}

/* ---- Disputes ----------------------------------------------------------- */

export async function listDisputes(q: PageQuery & { status?: DisputeStatus }) {
  await delay();
  const rows = db.disputes
    .filter((d) => !q.status || d.status === q.status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return paginate(rows, q);
}

export async function resolveDispute(id: string, resolutionNote: string): Promise<DisputeRecord> {
  await delay();
  const d = db.disputes.find((x) => x.id === id) ?? notFound("Dispute");
  if (d.status === "RESOLVED") bad("This dispute is already resolved");
  if (resolutionNote.trim().length < 3) bad("resolutionNote must be longer than or equal to 3 characters");
  d.status = "RESOLVED";
  d.resolutionNote = resolutionNote;
  d.resolvedById = db.MOCK_ADMIN.id;
  d.resolvedAt = nowIso();
  d.updatedAt = nowIso();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the API returns the bare row
  const { raisedBy, againstUser, visit, ...row } = clone(d);
  return row;
}

/* ---- Payouts ------------------------------------------------------------ */

export async function listPayouts(q: PageQuery & { status?: PayoutStatus }) {
  await delay();
  const rows = db.payouts
    .filter((p) => !q.status || p.status === q.status)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  return paginate(rows, q);
}

const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  REQUESTED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["TRANSFERRED", "REJECTED"],
  // Phase 15: admin sends (TRANSFERRED), then the caregiver confirms arrival (→ PAID).
  // Admin can resend (TRANSFERRED → TRANSFERRED) to clear a "not received" report.
  TRANSFERRED: ["TRANSFERRED"],
  PAID: [],
  REJECTED: [],
};

export async function resolvePayout(id: string, to: PayoutStatus, dto: ResolvePayoutInput): Promise<PayoutRequestRecord> {
  await delay();
  const p = db.payouts.find((x) => x.id === id) ?? notFound("Payout request");
  if (!PAYOUT_TRANSITIONS[p.status].includes(to)) bad(`Cannot move a payout from ${p.status} to ${to}`);
  if (to === "REJECTED" && !dto.reason) bad("A reason is required to reject a payout");
  p.status = to;
  p.processedAt = to === "PAID" || to === "REJECTED" ? nowIso() : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the API returns the bare row
  const { caregiver, payoutAccount, ...row } = clone(p);
  return row;
}

/* ---- Commissions -------------------------------------------------------- */

export async function listCommissions(): Promise<CommissionRate[]> {
  await delay();
  // The API orders by the Postgres enum order of Specialty.
  const order: Specialty[] = ["NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE"];
  return clone([...db.commissionRates].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)));
}

export async function updateCommission(category: Specialty, percentage: number): Promise<CommissionRate> {
  await delay();
  if (percentage < 0 || percentage > 100) bad("percentage must be between 0 and 100");
  let rate = db.commissionRates.find((r) => r.category === category);
  if (!rate) {
    rate = { id: `cr-${category}`, category, percentage: "0", effectiveFrom: nowIso(), createdAt: nowIso(), updatedAt: nowIso() };
    db.commissionRates.push(rate);
  }
  // Prisma Decimal serialises without trailing zeros ("20", "17.5").
  rate.percentage = String(Number(percentage.toFixed(2)));
  rate.effectiveFrom = nowIso();
  rate.updatedAt = nowIso();
  return clone(rate);
}

/* ---- Promos ------------------------------------------------------------- */

export async function listPromos(): Promise<PromoCode[]> {
  await delay();
  return clone([...db.promos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function createPromo(dto: CreatePromoInput): Promise<PromoCode> {
  await delay();
  // The API checks duplicates on the code as sent and only then upper-cases it;
  // the form always sends upper case. It does not check PERCENT <= 100 or the
  // date order (the form does).
  const code = dto.code.trim().toUpperCase();
  if (db.promos.some((p) => p.code === code)) bad("A promo code with this code already exists");
  const promo: PromoCode = {
    id: `promo-${Date.now()}`,
    code,
    discountType: dto.discountType,
    discountValue: dto.discountValue,
    validFrom: dto.validFrom,
    validTo: dto.validTo,
    maxUses: dto.maxUses ?? null,
    usesCount: 0,
    active: dto.active ?? true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.promos.push(promo);
  return clone(promo);
}

export async function updatePromo(id: string, dto: UpdatePromoInput): Promise<PromoCode> {
  await delay();
  const p = db.promos.find((x) => x.id === id) ?? notFound("Promo code");
  // Like the API: omitted/undefined fields are left unchanged (maxUses can't be cleared).
  const defined = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
  Object.assign(p, defined, { updatedAt: nowIso() });
  return clone(p);
}

/* ---- Platform config ---------------------------------------------------- */

export async function listConfig(): Promise<PlatformConfigItem[]> {
  await delay();
  return clone(db.platformConfig);
}

export async function setConfig(key: string, value: number): Promise<PlatformConfigSetResult> {
  await delay();
  const item = db.platformConfig.find((c) => c.key === key) ?? notFound("Config key");
  if (!Number.isFinite(value) || value < 0) bad("Config value must be a non-negative number");
  item.value = value;
  item.overridden = true;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the API omits `overridden` here
  const { overridden, ...result } = clone(item);
  return result;
}

export async function resetConfig(key: string): Promise<PlatformConfigSetResult> {
  await delay();
  const item = db.platformConfig.find((c) => c.key === key) ?? notFound("Config key");
  item.value = item.envDefault;
  item.overridden = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the API omits `overridden` here
  const { overridden, ...result } = clone(item);
  return result;
}
