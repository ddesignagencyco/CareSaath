/**
 * Admin API surface. Every function maps 1:1 to a backend route (shown in the
 * comment). While USE_MOCKS is on, calls go to the in-memory mock; otherwise
 * they hit the NestJS API.
 */
import * as mock from "../mock/handlers";
import type {
  AdminCaregiver,
  AdminCaregiverRecord,
  AdminPayoutRequest,
  AnalyticsOverview,
  AnalyticsRange,
  CommissionRate,
  CreatePromoInput,
  Dispute,
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
  SafetyIncident,
  SafetyIncidentRecord,
  Specialty,
  TokenPair,
  UpdateIncidentInput,
  UpdatePromoInput,
  VerificationStatus,
} from "@shared/types";
import { checkHealth, type Health } from "@shared/api/http";
import { http, USE_MOCKS } from "./http";

/**
 * The backend has no route for deactivating a caregiver account yet
 * (VerificationService.deactivate is not exposed), so the action only exists
 * against the mock.
 */
export const CAN_DEACTIVATE_CAREGIVER = USE_MOCKS;

export const healthApi = {
  /** GET /health (public) — the mock is always healthy. */
  check: (): Promise<Health> => (USE_MOCKS ? Promise.resolve({ status: "ok", postgres: true, redis: true }) : checkHealth()),
};

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) =>
    USE_MOCKS ? mock.requestOtp(phone) : http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone }),
  /** POST /auth/otp/verify */
  verifyOtp: (phone: string, code: string) =>
    USE_MOCKS ? mock.verifyOtp(phone, code) : http.post<TokenPair>("/auth/otp/verify", { phone, code }),
  /** POST /auth/logout */
  logout: (refreshToken: string) =>
    USE_MOCKS ? Promise.resolve({ ok: true }) : http.post<{ ok: boolean }>("/auth/logout", { refreshToken }),
};

export const caregiversApi = {
  /** GET /admin/caregivers?status=&page=&limit= */
  list: (q: PageQuery & { status?: VerificationStatus }) =>
    USE_MOCKS ? mock.listCaregivers(q) : http.get<Paginated<AdminCaregiver>>("/admin/caregivers", q),
  /** POST /admin/caregivers/:id/approve */
  approve: (id: string, reason?: string) =>
    USE_MOCKS ? mock.approveCaregiver(id) : http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/approve`, { reason }),
  /** POST /admin/caregivers/:id/reject */
  reject: (id: string, reason?: string) =>
    USE_MOCKS ? mock.rejectCaregiver(id) : http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reject`, { reason }),
  /** POST /admin/caregivers/:id/reverify — reverifyInDays is a string in the DTO. */
  reverify: (id: string, reverifyInDays?: number) =>
    USE_MOCKS
      ? mock.reverifyCaregiver(id, reverifyInDays)
      : http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reverify`, {
          reverifyInDays: reverifyInDays === undefined ? undefined : String(reverifyInDays),
        }),
  /** POST /admin/caregivers/:id/suspend */
  suspend: (id: string, reason?: string) =>
    USE_MOCKS ? mock.suspendCaregiver(id) : http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/suspend`, { reason }),
  /**
   * POST /admin/caregivers/:id/reactivate — the backend only sets the user
   * back to ACTIVE; it does NOT lift a SUSPENDED verification status.
   */
  reactivate: (id: string) =>
    USE_MOCKS ? mock.reactivateCaregiver(id) : http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reactivate`),
  /**
   * Mock only. VerificationService.deactivate exists in the backend but no
   * controller route exposes it yet (FR-A3), so in real mode this rejects
   * instead of calling a non-existent route. Gate the UI on
   * CAN_DEACTIVATE_CAREGIVER.
   */
  deactivate: (id: string): Promise<AdminCaregiverRecord> =>
    CAN_DEACTIVATE_CAREGIVER
      ? mock.deactivateCaregiver(id)
      : Promise.reject(new Error("Deactivating a caregiver is not supported by the API yet")),
  /** GET /admin/caregivers/:id/documents/:documentId/url */
  documentUrl: (id: string, documentId: string) =>
    USE_MOCKS
      ? mock.caregiverDocumentUrl(id, documentId)
      : http.get<DocumentUrl>(`/admin/caregivers/${id}/documents/${documentId}/url`),
};

export const analyticsApi = {
  /** GET /admin/analytics?range= */
  overview: (range: AnalyticsRange) =>
    USE_MOCKS ? mock.analytics(range) : http.get<AnalyticsOverview>("/admin/analytics", { range }),
  /**
   * GET /admin/reports/export?type=&format=csv — the API answers text/csv with
   * `Content-Disposition: attachment; filename="<type>-report.csv"`. CORS does
   * not expose that header, so the same filename is rebuilt here.
   */
  exportCsv: async (type: ReportType): Promise<{ filename: string; csv: string }> => {
    const csv = USE_MOCKS ? await mock.exportReport(type) : await http.get<string>("/admin/reports/export", { type, format: "csv" });
    return { filename: `${type}-report.csv`, csv: typeof csv === "string" ? csv : String(csv ?? "") };
  },
};

export const safetyApi = {
  /** GET /admin/safety-incidents?status=&priority=&page=&limit= */
  list: (q: PageQuery & { status?: IncidentStatus; priority?: IncidentPriority }) =>
    USE_MOCKS ? mock.listIncidents(q) : http.get<Paginated<SafetyIncident>>("/admin/safety-incidents", q),
  /** PATCH /admin/safety-incidents/:id */
  update: (id: string, dto: UpdateIncidentInput) =>
    USE_MOCKS ? mock.updateIncident(id, dto) : http.patch<SafetyIncidentRecord>(`/admin/safety-incidents/${id}`, dto),
};

export const disputesApi = {
  /** GET /admin/disputes?status=&page=&limit= */
  list: (q: PageQuery & { status?: DisputeStatus }) =>
    USE_MOCKS ? mock.listDisputes(q) : http.get<Paginated<Dispute>>("/admin/disputes", q),
  /** PATCH /admin/disputes/:id/resolve */
  resolve: (id: string, resolutionNote: string) =>
    USE_MOCKS
      ? mock.resolveDispute(id, resolutionNote)
      : http.patch<DisputeRecord>(`/admin/disputes/${id}/resolve`, { resolutionNote }),
};

export const payoutsApi = {
  /** GET /admin/payouts?status=&page=&limit= */
  list: (q: PageQuery & { status?: PayoutStatus }) =>
    USE_MOCKS ? mock.listPayouts(q) : http.get<Paginated<AdminPayoutRequest>>("/admin/payouts", q),
  /** POST /admin/payouts/:id/approve (REQUESTED -> PROCESSING) */
  approve: (id: string, dto: ResolvePayoutInput = {}) =>
    USE_MOCKS ? mock.resolvePayout(id, "PROCESSING", dto) : http.post<PayoutRequestRecord>(`/admin/payouts/${id}/approve`, dto),
  /** POST /admin/payouts/:id/mark-paid (PROCESSING -> PAID) */
  markPaid: (id: string, dto: ResolvePayoutInput = {}) =>
    USE_MOCKS ? mock.resolvePayout(id, "PAID", dto) : http.post<PayoutRequestRecord>(`/admin/payouts/${id}/mark-paid`, dto),
  /** POST /admin/payouts/:id/reject (reason required) */
  reject: (id: string, dto: ResolvePayoutInput) =>
    USE_MOCKS ? mock.resolvePayout(id, "REJECTED", dto) : http.post<PayoutRequestRecord>(`/admin/payouts/${id}/reject`, dto),
};

export const commissionsApi = {
  /** GET /admin/commissions */
  list: () => (USE_MOCKS ? mock.listCommissions() : http.get<CommissionRate[]>("/admin/commissions")),
  /** PUT /admin/commissions/:category */
  update: (category: Specialty, percentage: number) =>
    USE_MOCKS
      ? mock.updateCommission(category, percentage)
      : http.put<CommissionRate>(`/admin/commissions/${category}`, { percentage }),
};

export const promosApi = {
  /** GET /admin/promos */
  list: () => (USE_MOCKS ? mock.listPromos() : http.get<PromoCode[]>("/admin/promos")),
  /** POST /admin/promos */
  create: (dto: CreatePromoInput) => (USE_MOCKS ? mock.createPromo(dto) : http.post<PromoCode>("/admin/promos", dto)),
  /** PATCH /admin/promos/:id */
  update: (id: string, dto: UpdatePromoInput) =>
    USE_MOCKS ? mock.updatePromo(id, dto) : http.patch<PromoCode>(`/admin/promos/${id}`, dto),
};

export const configApi = {
  /** GET /admin/config */
  list: () => (USE_MOCKS ? mock.listConfig() : http.get<PlatformConfigItem[]>("/admin/config")),
  /** PUT /admin/config/:key */
  set: (key: string, value: number) =>
    USE_MOCKS ? mock.setConfig(key, value) : http.put<PlatformConfigSetResult>(`/admin/config/${encodeURIComponent(key)}`, { value }),
};
