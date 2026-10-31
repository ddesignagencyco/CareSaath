/**
 * Admin API surface. Every function maps 1:1 to a backend route (shown in the
 * comment).
 */
import type {
  AdminCaregiver,
  AdminCaregiverRecord,
  AdminBookingListItem,
  AdminCustomer,
  AdminCustomerDetail,
  AdminPayment,
  AdminPayoutRequest,
  AdminVisitListItem,
  BookingStatus,
  AnalyticsOverview,
  AnalyticsRange,
  AuditLogEntry,
  CallLogEntry,
  CaregiverBadge,
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
  StrikeReason,
  TokenPair,
  UpdateIncidentInput,
  UpdatePromoInput,
  VerificationStatus,
  VisitStatus,
} from "@shared/types";
import { checkHealth, type Health } from "@shared/api/http";
import type { Me, PaymentStatus } from "@shared/caregiver-types";
import { http } from "./http";

/** FR-A3 deactivate is now exposed by the backend (POST /admin/caregivers/:id/deactivate). */
export const CAN_DEACTIVATE_CAREGIVER = true;

/**
 * Manual caregiver tier-badge override. Flip to `true` once the backend ships
 * `POST /admin/caregivers/:id/badge` and includes `badge`/`badgeOverride` on the
 * admin payload (spec in docs/requirement.md). Until then the drawer shows the
 * tier read-only and hides the override control.
 */
export const CAN_OVERRIDE_BADGE = true;

/** Admin payments ledger — live: backend ships `GET /admin/payments` (?status=, ?visitId=, page, limit). */
export const CAN_ADMIN_PAYMENTS = true;

/** Admin audit-log viewer — live: backend ships `GET /admin/audit-logs` (?entityType=, ?actorId=, page, limit). */
export const CAN_AUDIT_LOG = true;

/** Admin in-app call history — live: backend ships `GET /admin/call-logs` (?visitId=, page, limit; filter for investigation). */
export const CAN_CALL_LOGS = true;

/** Manual caregiver strike reset/add — live: backend ships `POST /admin/caregivers/:id/strikes`. */
export const CAN_MANAGE_STRIKES = true;

export const healthApi = {
  /** GET /health (public) — the mock is always healthy. */
  check: (): Promise<Health> => checkHealth(),
};

export const meApi = {
  /** GET /customer/me — the shared profile endpoint; used to show the admin's own name. */
  get: (): Promise<Me> => http.get<Me>("/customer/me"),
};

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) =>
    http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone }),
  /** POST /auth/otp/verify */
  verifyOtp: (phone: string, code: string) =>
    http.post<TokenPair>("/auth/otp/verify", { phone, code }),
  /** POST /auth/logout */
  logout: (refreshToken: string) =>
    http.post<{ ok: boolean }>("/auth/logout", { refreshToken }),
};

export const caregiversApi = {
  /** GET /admin/caregivers?status=&q=&reverifyDueBefore=&page=&limit= (q = name/phone/license; reverifyDueBefore → due-asc order) */
  list: (q: PageQuery & { status?: VerificationStatus; q?: string; reverifyDueBefore?: string }) =>
    http.get<Paginated<AdminCaregiver>>("/admin/caregivers", q),
  /** POST /admin/caregivers/:id/approve */
  approve: (id: string, reason?: string) =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/approve`, { reason }),
  /** POST /admin/caregivers/:id/reject */
  reject: (id: string, reason?: string) =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reject`, { reason }),
  /** POST /admin/caregivers/:id/reverify — reverifyInDays is a string in the DTO. */
  reverify: (id: string, reverifyInDays?: number) =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reverify`, {
      reverifyInDays: reverifyInDays === undefined ? undefined : String(reverifyInDays),
    }),
  /** POST /admin/caregivers/:id/suspend */
  suspend: (id: string, reason?: string) =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/suspend`, { reason }),
  /**
   * POST /admin/caregivers/:id/reactivate — the backend only sets the user
   * back to ACTIVE; it does NOT lift a SUSPENDED verification status.
   */
  reactivate: (id: string) =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/reactivate`),
  /** POST /admin/caregivers/:id/deactivate (FR-A3) — blocks the user account and hides them from search. */
  deactivate: (id: string, reason?: string): Promise<AdminCaregiverRecord> =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/deactivate`, { reason }),
  /**
   * POST /admin/caregivers/:id/badge — manual tier override; `badge: null` clears it (back to auto-computed).
   * Gated behind CAN_OVERRIDE_BADGE until the backend endpoint exists (spec in docs/requirement.md).
   */
  setBadge: (id: string, badge: CaregiverBadge | null): Promise<AdminCaregiverRecord> =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/badge`, { badge }),
  /** POST /admin/caregivers/:id/strikes — reset to 0, or add a manual strike. Gated behind CAN_MANAGE_STRIKES (spec in docs/requirement.md). */
  setStrikes: (id: string, body: { op: "reset" } | { op: "add"; reason: StrikeReason; note?: string }): Promise<AdminCaregiverRecord> =>
    http.post<AdminCaregiverRecord>(`/admin/caregivers/${id}/strikes`, body),
  /** GET /admin/caregivers/:id/documents/:documentId/url */
  documentUrl: (id: string, documentId: string) =>
    http.get<DocumentUrl>(`/admin/caregivers/${id}/documents/${documentId}/url`),
};

export const analyticsApi = {
  /** GET /admin/analytics?range= */
  overview: (range: AnalyticsRange) =>
    http.get<AnalyticsOverview>("/admin/analytics", { range }),
  /**
   * GET /admin/reports/export?type=&format=csv — the API answers text/csv with
   * `Content-Disposition: attachment; filename="<type>-report.csv"`. CORS does
   * not expose that header, so the same filename is rebuilt here.
   */
  exportCsv: async (type: ReportType): Promise<{ filename: string; csv: string }> => {
    const csv = await http.get<string>("/admin/reports/export", { type, format: "csv" });
    return { filename: `${type}-report.csv`, csv: typeof csv === "string" ? csv : String(csv ?? "") };
  },
};

export const safetyApi = {
  /** GET /admin/safety-incidents?status=&priority=&page=&limit= */
  list: (q: PageQuery & { status?: IncidentStatus; priority?: IncidentPriority }) =>
    http.get<Paginated<SafetyIncident>>("/admin/safety-incidents", q),
  /** PATCH /admin/safety-incidents/:id */
  update: (id: string, dto: UpdateIncidentInput) =>
    http.patch<SafetyIncidentRecord>(`/admin/safety-incidents/${id}`, dto),
};

export const disputesApi = {
  /** GET /admin/disputes?status=&priority=&page=&limit= */
  list: (q: PageQuery & { status?: DisputeStatus; priority?: IncidentPriority }) =>
    http.get<Paginated<Dispute>>("/admin/disputes", q),
  /** PATCH /admin/disputes/:id/resolve — optional compensationAmount (paisa) recorded with the decision. */
  resolve: (id: string, resolutionNote: string, compensationAmount?: number) =>
    http.patch<DisputeRecord>(`/admin/disputes/${id}/resolve`, { resolutionNote, ...(compensationAmount != null ? { compensationAmount } : {}) }),
  /** PATCH /admin/disputes/:id/assign — assign to an admin; omit adminId to self-assign. Real backend only. */
  assign: (id: string, adminId?: string) =>
    http.patch<DisputeRecord>(`/admin/disputes/${id}/assign`, adminId ? { adminId } : {}),
  /** PATCH /admin/disputes/:id/priority — set triage priority. Real backend only. */
  setPriority: (id: string, priority: IncidentPriority) =>
    http.patch<DisputeRecord>(`/admin/disputes/${id}/priority`, { priority }),
};

export const payoutsApi = {
  /** GET /admin/payouts?status=&q=&page=&limit= (q = caregiver name/phone) */
  list: (q: PageQuery & { status?: PayoutStatus; q?: string }) =>
    http.get<Paginated<AdminPayoutRequest>>("/admin/payouts", q),
  /** POST /admin/payouts/:id/approve (REQUESTED -> PROCESSING) */
  approve: (id: string, dto: ResolvePayoutInput = {}) =>
    http.post<PayoutRequestRecord>(`/admin/payouts/${id}/approve`, dto),
  /** POST /admin/payouts/:id/mark-transferred (PROCESSING -> TRANSFERRED) — Phase 15. */
  markTransferred: (id: string, dto: ResolvePayoutInput = {}) =>
    http.post<PayoutRequestRecord>(`/admin/payouts/${id}/mark-transferred`, dto),
  /** @deprecated POST /admin/payouts/:id/mark-paid — Phase 15 alias of mark-transferred (now ends at TRANSFERRED, not PAID). */
  markPaid: (id: string, dto: ResolvePayoutInput = {}) =>
    http.post<PayoutRequestRecord>(`/admin/payouts/${id}/mark-paid`, dto),
  /** POST /admin/payouts/:id/reject (reason required) */
  reject: (id: string, dto: ResolvePayoutInput) =>
    http.post<PayoutRequestRecord>(`/admin/payouts/${id}/reject`, dto),
  /** GET /admin/payouts/:id/receipt — transfer PDF blob (Phase 15; real backend only). */
  receipt: (id: string) => http.download(`/admin/payouts/${id}/receipt`),
};

export const commissionsApi = {
  /** GET /admin/commissions */
  list: () => (http.get<CommissionRate[]>("/admin/commissions")),
  /** PUT /admin/commissions/:category */
  update: (category: Specialty, percentage: number) =>
    http.put<CommissionRate>(`/admin/commissions/${category}`, { percentage }),
};

export const promosApi = {
  /** GET /admin/promos */
  list: () => (http.get<PromoCode[]>("/admin/promos")),
  /** POST /admin/promos */
  create: (dto: CreatePromoInput) => (http.post<PromoCode>("/admin/promos", dto)),
  /** PATCH /admin/promos/:id */
  update: (id: string, dto: UpdatePromoInput) =>
    http.patch<PromoCode>(`/admin/promos/${id}`, dto),
};

export const configApi = {
  /** GET /admin/config */
  list: () => (http.get<PlatformConfigItem[]>("/admin/config")),
  /** PUT /admin/config/:key */
  set: (key: string, value: number) =>
    http.put<PlatformConfigSetResult>(`/admin/config/${encodeURIComponent(key)}`, { value }),
  /** DELETE /admin/config/:key — removes the override so the setting returns to its env default. */
  reset: (key: string) =>
    http.delete<PlatformConfigSetResult>(`/admin/config/${encodeURIComponent(key)}`),
};

export const paymentsApi = {
  /** GET /admin/payments?status=&visitId=&page=&limit= — admin payments ledger (no method filter server-side). */
  list: (q: PageQuery & { status?: PaymentStatus; visitId?: string }) =>
    http.get<Paginated<AdminPayment>>("/admin/payments", q),
  /** GET /admin/payments/:id/receipt — payment receipt PDF blob (real backend only). */
  receipt: (id: string) => http.download(`/admin/payments/${id}/receipt`),
};

export const auditApi = {
  /** GET /admin/audit-logs?entityType=&actorId=&page=&limit= — append-only audit trail. Backend endpoint pending; gated behind CAN_AUDIT_LOG (see requirement.md). */
  list: (q: PageQuery & { entityType?: string; actorId?: string }) =>
    http.get<Paginated<AuditLogEntry>>("/admin/audit-logs", q),
};

export const callLogsApi = {
  /** GET /admin/call-logs?visitId=&page=&limit= — persisted in-app call history (investigation; filter by visit, not status). */
  list: (q: PageQuery & { visitId?: string }) =>
    http.get<Paginated<CallLogEntry>>("/admin/call-logs", q),
};

/** Read-only operator browser for every booking/visit (admin only). */
export const adminBookingsApi = {
  /** GET /admin/bookings?status=&isImmediate=&customerId=&caregiverId=&page=&limit= */
  listBookings: (q: PageQuery & { status?: BookingStatus; isImmediate?: boolean; customerId?: string; caregiverId?: string }) =>
    http.get<Paginated<AdminBookingListItem>>("/admin/bookings", q),
  /** GET /admin/bookings/:id */
  getBooking: (id: string) => http.get<AdminBookingListItem>(`/admin/bookings/${id}`),
  /** GET /admin/visits?status=&bookingId=&from=&to=&sort=&page=&limit= */
  listVisits: (q: PageQuery & { status?: VisitStatus; bookingId?: string; from?: string; to?: string; sort?: "asc" | "desc" }) =>
    http.get<Paginated<AdminVisitListItem>>("/admin/visits", q),
  /** GET /admin/visits/:id */
  getVisit: (id: string) => http.get<AdminVisitListItem>(`/admin/visits/${id}`),
};

/** Admin customer directory + support actions. */
export const customersApi = {
  /** GET /admin/customers?q=&page=&limit= (q = name/phone/email) */
  list: (q: PageQuery & { q?: string }) => http.get<Paginated<AdminCustomer>>("/admin/customers", q),
  /** GET /admin/customers/:id — profile + recent bookings. */
  get: (id: string) => http.get<AdminCustomerDetail>(`/admin/customers/${id}`),
  /** POST /admin/customers/:id/deactivate — blocks sign-in. */
  deactivate: (id: string, reason?: string) =>
    http.post<AdminCustomerDetail>(`/admin/customers/${id}/deactivate`, reason ? { reason } : {}),
  /** POST /admin/customers/:id/reactivate — restores the account. */
  reactivate: (id: string) => http.post<AdminCustomerDetail>(`/admin/customers/${id}/reactivate`, {}),
};
