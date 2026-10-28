/**
 * Caregiver API surface. Each function maps 1:1 to a backend route (in the
 * comment). With USE_MOCKS on, calls go to the in-browser mock instead.
 */
import type { UploadFile } from "../http";
import type {
  AppNotification,
  Availability,
  AvailabilityBlock,
  AvailabilityRuleInput,
  BookingDetail,
  CaregiverBookingListItem,
  CaregiverBookingStatus,
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
  PayoutRequestRow,
  RegisterCaregiverInput,
  SafetyIncidentRow,
  SosInput,
  SosResult,
  UpdateCaregiverProfileInput,
  Visit,
} from "../types";
import type { CaregiverDocument, DocType, IncidentPriority, PageQuery, Paginated, PayoutAccount, PayoutStatus, TokenPair, VisitStatus } from "../types";
import * as mock from "./mock-handlers";
import { http, USE_MOCKS } from "./http";

const M = USE_MOCKS;

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) => (M ? mock.requestOtp(phone) : http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone })),
  /** POST /auth/otp/verify — always yields a CUSTOMER for new numbers. */
  verifyOtp: (phone: string, code: string) => (M ? mock.verifyOtp(phone, code) : http.post<TokenPair>("/auth/otp/verify", { phone, code })),
  /** POST /auth/refresh — needed right after register so the token carries CAREGIVER. */
  refresh: (refreshToken: string) => (M ? mock.refresh() : http.post<TokenPair>("/auth/refresh", { refreshToken })),
  /** POST /auth/logout */
  logout: (refreshToken: string) => (M ? Promise.resolve({ ok: true }) : http.post<{ ok: boolean }>("/auth/logout", { refreshToken })),
};

export const meApi = {
  /** GET /customer/me — works for any role; tells us if a caregiver profile exists. */
  get: () => (M ? mock.me() : http.get<Me>("/customer/me")),
  /** PATCH /customer/me — the only way to set the display name. */
  update: (dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) => (M ? mock.updateMe(dto) : http.patch<Pick<Me, "id" | "phone" | "fullName" | "preferredLanguage">>("/customer/me", dto)),
};

export const profileApi = {
  /** POST /caregiver/register */
  register: (dto: RegisterCaregiverInput) => (M ? mock.register(dto) : http.post<CaregiverProfileRow>("/caregiver/register", dto)),
  /** GET /caregiver/profile */
  get: () => (M ? mock.getProfile() : http.get<MyCaregiverProfile>("/caregiver/profile")),
  /** PATCH /caregiver/profile */
  update: (dto: UpdateCaregiverProfileInput) => (M ? mock.updateProfile(dto) : http.patch<CaregiverProfileRow>("/caregiver/profile", dto)),
  /** POST /caregiver/documents (multipart: file + type) */
  uploadDocument: (file: UploadFile, type: DocType) => (M ? mock.uploadDocument(file, type) : http.upload<CaregiverDocument>("/caregiver/documents", file, { type })),
  /** GET /caregiver/documents/:id/url */
  documentUrl: (id: string) => (M ? mock.documentUrl(id) : http.get<{ url: string }>(`/caregiver/documents/${id}/url`)),
  /** POST /caregiver/photo (multipart: file) */
  uploadPhoto: (file: UploadFile) => (M ? mock.uploadPhoto(file) : http.upload<{ photoKey: string }>("/caregiver/photo", file)),
  /** GET /caregiver/photo/url — 404 "No photo uploaded" when photoKey is null. */
  photoUrl: () => (M ? mock.photoUrl() : http.get<{ url: string }>("/caregiver/photo/url")),
};

export const availabilityApi = {
  /** GET /caregiver/availability */
  get: () => (M ? mock.getAvailability() : http.get<Availability>("/caregiver/availability")),
  /** PUT /caregiver/availability — full replace. */
  put: (rules: AvailabilityRuleInput[]) => (M ? mock.putAvailability(rules) : http.put<Availability>("/caregiver/availability", { rules })),
  /** POST /caregiver/availability/blocks */
  addBlock: (dto: { startDate: string; endDate: string; reason?: string }) => (M ? mock.addBlock(dto) : http.post<AvailabilityBlock>("/caregiver/availability/blocks", dto)),
  /** DELETE /caregiver/availability/blocks/:id */
  deleteBlock: (id: string) => (M ? mock.deleteBlock(id) : http.delete<{ ok: true }>(`/caregiver/availability/blocks/${id}`)),
};

export const bookingsApi = {
  /** GET /caregiver/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) => (M ? mock.listBookings(q) : http.get<Paginated<CaregiverBookingListItem>>("/caregiver/bookings", q)),
  /** POST /caregiver/bookings/:id/accept */
  accept: (id: string) => (M ? mock.acceptBooking(id) : http.post<BookingDetail>(`/caregiver/bookings/${id}/accept`)),
  /** POST /caregiver/bookings/:id/decline */
  decline: (id: string, reason?: string) => (M ? mock.declineBooking(id, reason) : http.post<BookingDetail>(`/caregiver/bookings/${id}/decline`, reason ? { reason } : {})),
  /** GET /caregiver/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (bookingId: string, documentId: string) =>
    M ? mock.prescriptionUrl(bookingId, documentId) : http.get<{ url: string; mimeType: string }>(`/caregiver/bookings/${bookingId}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /caregiver/visits?status=&date=&from=&to=&sort= (date/from/to are YYYY-MM-DD; sort by scheduled date). */
  list: (q: PageQuery & { status?: VisitStatus; date?: string; from?: string; to?: string; sort?: "asc" | "desc" }) =>
    M ? mock.listVisits(q) : http.get<Paginated<CaregiverVisitListItem>>("/caregiver/visits", q),
  /** GET /caregiver/visits/:id */
  get: (id: string) => (M ? mock.getVisit(id) : http.get<CaregiverVisitDetail>(`/caregiver/visits/${id}`)),
  /** POST /caregiver/visits/:id/en-route */
  enRoute: (id: string) => (M ? mock.enRoute(id) : http.post<Visit>(`/caregiver/visits/${id}/en-route`)),
  /** POST /caregiver/visits/:id/check-in-otp — code is SMSed to the customer. */
  checkInOtp: (id: string) => (M ? mock.checkInOtp(id) : http.post<{ ttlSeconds: number; sentTo: string }>(`/caregiver/visits/${id}/check-in-otp`)),
  /** POST /caregiver/visits/:id/check-in */
  checkIn: (id: string, dto: CheckInInput) => (M ? mock.checkIn(id, dto) : http.post<Visit>(`/caregiver/visits/${id}/check-in`, dto)),
  /** POST /caregiver/visits/:id/check-out */
  checkOut: (id: string, dto: CheckInInput) => (M ? mock.checkOut(id, dto) : http.post<Visit>(`/caregiver/visits/${id}/check-out`, dto)),
  /** POST /caregiver/visits/:id/note — completes the visit. */
  note: (id: string, summary: string) => (M ? mock.submitNote(id, summary) : http.post<CaregiverVisitDetail>(`/caregiver/visits/${id}/note`, { summary })),
};

export const paymentsApi = {
  /** POST /caregiver/payments/:id/confirm-cash — CASH + PENDING only; settles it as PAID. */
  confirmCash: (paymentId: string) =>
    M ? mock.confirmCash(paymentId) : http.post<CaregiverPaymentRow>(`/caregiver/payments/${paymentId}/confirm-cash`),
  /** GET /caregiver/payments/:id/receipt — the payment record PDF. Real API only. */
  openReceipt: (paymentId: string) => http.openFile(`/caregiver/payments/${paymentId}/receipt`, `care-sath-payment-${paymentId.slice(0, 8)}.pdf`),
};

export const moneyApi = {
  /** GET /caregiver/earnings */
  earnings: () => (M ? mock.earnings() : http.get<Earnings>("/caregiver/earnings")),
  /** GET /caregiver/payouts?status= */
  payouts: (q: PageQuery & { status?: PayoutStatus }) => (M ? mock.listPayouts(q) : http.get<Paginated<CaregiverPayoutRequest>>("/caregiver/payouts", q)),
  /** GET /caregiver/payouts/:id/receipt — the transfer receipt PDF. Real API only. */
  openPayoutReceipt: (id: string) => http.openFile(`/caregiver/payouts/${id}/receipt`, `care-sath-payout-${id.slice(0, 8)}.pdf`),
  /** POST /caregiver/payouts/:id/confirm-received — TRANSFERRED → PAID. */
  confirmPayoutReceived: (id: string) => (M ? mock.confirmPayoutReceived(id) : http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/confirm-received`)),
  /** POST /caregiver/payouts/:id/report-not-received — flags it for the admin to check and resend. */
  reportPayoutNotReceived: (id: string, note: string) =>
    M ? mock.reportPayoutNotReceived(id, note) : http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/report-not-received`, { note }),
  /** POST /caregiver/payouts */
  requestPayout: (dto: { payoutAccountId: string; amount: number }) => (M ? mock.requestPayout(dto) : http.post<PayoutRequestRow>("/caregiver/payouts", dto)),
  /** GET /caregiver/payout-accounts */
  accounts: () => (M ? mock.listPayoutAccounts() : http.get<PayoutAccount[]>("/caregiver/payout-accounts")),
  /** POST /caregiver/payout-accounts */
  createAccount: (dto: PayoutAccountInput) => (M ? mock.createPayoutAccount(dto) : http.post<PayoutAccount>("/caregiver/payout-accounts", dto)),
  /** PATCH /caregiver/payout-accounts/:id */
  updateAccount: (id: string, dto: Partial<PayoutAccountInput>) => (M ? mock.updatePayoutAccount(id, dto) : http.patch<PayoutAccount>(`/caregiver/payout-accounts/${id}`, dto)),
  /** DELETE /caregiver/payout-accounts/:id */
  deleteAccount: (id: string) => (M ? mock.deletePayoutAccount(id) : http.delete<{ ok: true }>(`/caregiver/payout-accounts/${id}`)),
};

export const safetyApi = {
  /** GET /caregiver/safety-reports (plain array) */
  list: () => (M ? mock.listSafetyReports() : http.get<SafetyIncidentRow[]>("/caregiver/safety-reports")),
  /** POST /caregiver/safety-reports */
  report: (dto: { visitId: string; description: string; priority?: IncidentPriority }) => (M ? mock.createSafetyReport(dto) : http.post<SafetyIncidentRow>("/caregiver/safety-reports", dto)),
  /** POST /sos — coordinates go as strings (SosDto types them `string`, no validator). */
  sos: (dto: SosInput) => (M ? mock.sos(dto) : http.post<SosResult>("/sos", dto)),
};

export const disputesApi = {
  /** GET /disputes (plain array) */
  list: () => (M ? mock.listDisputes() : http.get<DisputeRow[]>("/disputes")),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => (M ? mock.raiseDispute(dto) : http.post<DisputeRow>("/disputes", dto)),
};

export const notificationsApi = {
  /** GET /notifications?channel=&unread= — one row per channel; the app shows PUSH rows only. */
  list: (q: PageQuery & { channel?: string; unread?: boolean }) =>
    M ? mock.listNotifications(q) : http.get<Paginated<AppNotification>>("/notifications", q),
  /** POST /notifications/read — mark the given ids (or everything before a time) as read. */
  markRead: (dto: { ids?: string[]; before?: string }) =>
    M ? mock.markNotifsRead(dto) : http.post<{ updated: number }>("/notifications/read", dto),
};
