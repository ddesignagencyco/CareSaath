/**
 * Caregiver API surface. Each function maps 1:1 to a backend route (in the
 * comment).
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
  CaregiverServiceArea,
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
  ServiceAreaInput,
  SosInput,
  SosResult,
  UpdateCaregiverProfileInput,
  Visit,
} from "../types";
import type { CaregiverDocument, CreateMedicalOrderInput, DocType, IncidentPriority, MedicalOrder, PageQuery, Paginated, PayoutAccount, PayoutStatus, TokenPair, VisitStatus } from "../types";
import { http } from "./http";

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) => http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone }),
  /** POST /auth/otp/verify — always yields a CUSTOMER for new numbers. */
  verifyOtp: (phone: string, code: string) => http.post<TokenPair>("/auth/otp/verify", { phone, code }),
  /** POST /auth/refresh — needed right after register so the token carries CAREGIVER. */
  refresh: (refreshToken: string) => http.post<TokenPair>("/auth/refresh", { refreshToken }),
  /** POST /auth/logout */
  logout: (refreshToken: string) => http.post<{ ok: boolean }>("/auth/logout", { refreshToken }),
};

export const meApi = {
  /** GET /customer/me — works for any role; tells us if a caregiver profile exists. */
  get: () => http.get<Me>("/customer/me"),
  /** PATCH /customer/me — the only way to set the display name. */
  update: (dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) => http.patch<Pick<Me, "id" | "phone" | "fullName" | "preferredLanguage">>("/customer/me", dto),
};

export const profileApi = {
  /** POST /caregiver/register */
  register: (dto: RegisterCaregiverInput) => http.post<CaregiverProfileRow>("/caregiver/register", dto),
  /** GET /caregiver/profile */
  get: () => http.get<MyCaregiverProfile>("/caregiver/profile"),
  /** PATCH /caregiver/profile */
  update: (dto: UpdateCaregiverProfileInput) => http.patch<CaregiverProfileRow>("/caregiver/profile", dto),
  /** POST /caregiver/documents (multipart: file + type) */
  uploadDocument: (file: UploadFile, type: DocType) => http.upload<CaregiverDocument>("/caregiver/documents", file, { type }),
  /** GET /caregiver/documents/:id/url */
  documentUrl: (id: string) => http.get<{ url: string }>(`/caregiver/documents/${id}/url`),
  /** POST /caregiver/photo (multipart: file) */
  uploadPhoto: (file: UploadFile) => http.upload<{ photoKey: string }>("/caregiver/photo", file),
  /** GET /caregiver/photo/url — 404 "No photo uploaded" when photoKey is null. */
  photoUrl: () => http.get<{ url: string }>("/caregiver/photo/url"),
  /** GET /caregiver/service-areas — sub-city coverage zones (empty = whole city). */
  serviceAreas: () => http.get<CaregiverServiceArea[]>("/caregiver/service-areas"),
  /** PUT /caregiver/service-areas — full replace (empty list = whole-city coverage). */
  setServiceAreas: (areas: ServiceAreaInput[]) => http.put<CaregiverServiceArea[]>("/caregiver/service-areas", { areas }),
};

export const availabilityApi = {
  /** GET /caregiver/availability */
  get: () => http.get<Availability>("/caregiver/availability"),
  /** PUT /caregiver/availability — full replace. */
  put: (rules: AvailabilityRuleInput[]) => http.put<Availability>("/caregiver/availability", { rules }),
  /** POST /caregiver/availability/blocks */
  addBlock: (dto: { startDate: string; endDate: string; reason?: string }) => http.post<AvailabilityBlock>("/caregiver/availability/blocks", dto),
  /** DELETE /caregiver/availability/blocks/:id */
  deleteBlock: (id: string) => http.delete<{ ok: true }>(`/caregiver/availability/blocks/${id}`),
  /** PUT /caregiver/available-now — opt in/out of immediate (ASAP / emergency) requests. */
  setAvailableNow: (available: boolean) =>
    http.put<{ acceptingImmediate: boolean; availableNow: boolean; locationUpdatedAt: string | null }>("/caregiver/available-now", { available }),
  /** PATCH /caregiver/location — share live GPS so nearby families can book an immediate visit (keeps "available now" alive). */
  updateLocation: (lat: number, lng: number) => http.patch<void>("/caregiver/location", { lat, lng }),
};

export const bookingsApi = {
  /** GET /caregiver/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) => http.get<Paginated<CaregiverBookingListItem>>("/caregiver/bookings", q),
  /** POST /caregiver/bookings/:id/accept */
  accept: (id: string) => http.post<BookingDetail>(`/caregiver/bookings/${id}/accept`),
  /** POST /caregiver/bookings/:id/decline */
  decline: (id: string, reason?: string) => http.post<BookingDetail>(`/caregiver/bookings/${id}/decline`, reason ? { reason } : {}),
  /** GET /caregiver/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (bookingId: string, documentId: string) =>
    http.get<{ url: string; mimeType: string }>(`/caregiver/bookings/${bookingId}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /caregiver/visits?status=&date=&from=&to=&sort= (date/from/to are YYYY-MM-DD; sort by scheduled date). */
  list: (q: PageQuery & { status?: VisitStatus; date?: string; from?: string; to?: string; sort?: "asc" | "desc" }) =>
    http.get<Paginated<CaregiverVisitListItem>>("/caregiver/visits", q),
  /** GET /caregiver/visits/:id */
  get: (id: string) => http.get<CaregiverVisitDetail>(`/caregiver/visits/${id}`),
  /** POST /caregiver/visits/:id/en-route */
  enRoute: (id: string) => http.post<Visit>(`/caregiver/visits/${id}/en-route`),
  /** POST /caregiver/visits/:id/check-in-otp — code is SMSed to the customer. */
  checkInOtp: (id: string) => http.post<{ ttlSeconds: number; sentTo: string }>(`/caregiver/visits/${id}/check-in-otp`),
  /** POST /caregiver/visits/:id/check-in */
  checkIn: (id: string, dto: CheckInInput) => http.post<Visit>(`/caregiver/visits/${id}/check-in`, dto),
  /** POST /caregiver/visits/:id/check-out */
  checkOut: (id: string, dto: CheckInInput) => http.post<Visit>(`/caregiver/visits/${id}/check-out`, dto),
  /** POST /caregiver/visits/:id/note — completes the visit. */
  note: (id: string, summary: string) => http.post<CaregiverVisitDetail>(`/caregiver/visits/${id}/note`, { summary }),
};

export const medicalOrdersApi = {
  /** GET /caregiver/visits/:visitId/medical-orders — diagnosis / prescription / lab records (newest first). */
  list: (visitId: string) => http.get<MedicalOrder[]>(`/caregiver/visits/${visitId}/medical-orders`),
  /** POST /caregiver/visits/:visitId/medical-orders — doctor-only; the customer is notified. */
  create: (visitId: string, dto: CreateMedicalOrderInput) => http.post<MedicalOrder>(`/caregiver/visits/${visitId}/medical-orders`, dto),
  /** GET /caregiver/visits/:visitId/medical-orders/:id/pdf — branded prescription PDF (downloads + opens). */
  openPdf: (visitId: string, id: string) => http.openFile(`/caregiver/visits/${visitId}/medical-orders/${id}/pdf`, `care-sath-prescription-${id.slice(0, 8)}.pdf`),
};

export const paymentsApi = {
  /** POST /caregiver/payments/:id/confirm-cash — CASH + PENDING only; settles it as PAID. */
  confirmCash: (paymentId: string) =>
    http.post<CaregiverPaymentRow>(`/caregiver/payments/${paymentId}/confirm-cash`),
  /** GET /caregiver/payments/:id/receipt — the payment record PDF. */
  openReceipt: (paymentId: string) => http.openFile(`/caregiver/payments/${paymentId}/receipt`, `care-sath-payment-${paymentId.slice(0, 8)}.pdf`),
};

export const moneyApi = {
  /** GET /caregiver/earnings */
  earnings: () => http.get<Earnings>("/caregiver/earnings"),
  /** GET /caregiver/payouts?status= */
  payouts: (q: PageQuery & { status?: PayoutStatus }) => http.get<Paginated<CaregiverPayoutRequest>>("/caregiver/payouts", q),
  /** GET /caregiver/payouts/:id/receipt — the transfer receipt PDF. */
  openPayoutReceipt: (id: string) => http.openFile(`/caregiver/payouts/${id}/receipt`, `care-sath-payout-${id.slice(0, 8)}.pdf`),
  /** POST /caregiver/payouts/:id/confirm-received — TRANSFERRED → PAID. */
  confirmPayoutReceived: (id: string) => http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/confirm-received`),
  /** POST /caregiver/payouts/:id/report-not-received — flags it for the admin to check and resend. */
  reportPayoutNotReceived: (id: string, note: string) =>
    http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/report-not-received`, { note }),
  /** POST /caregiver/payouts */
  requestPayout: (dto: { payoutAccountId: string; amount: number }) => http.post<PayoutRequestRow>("/caregiver/payouts", dto),
  /** GET /caregiver/payout-accounts */
  accounts: () => http.get<PayoutAccount[]>("/caregiver/payout-accounts"),
  /** POST /caregiver/payout-accounts */
  createAccount: (dto: PayoutAccountInput) => http.post<PayoutAccount>("/caregiver/payout-accounts", dto),
  /** PATCH /caregiver/payout-accounts/:id */
  updateAccount: (id: string, dto: Partial<PayoutAccountInput>) => http.patch<PayoutAccount>(`/caregiver/payout-accounts/${id}`, dto),
  /** DELETE /caregiver/payout-accounts/:id */
  deleteAccount: (id: string) => http.delete<{ ok: true }>(`/caregiver/payout-accounts/${id}`),
};

export const safetyApi = {
  /** GET /caregiver/safety-reports (plain array) */
  list: () => http.get<SafetyIncidentRow[]>("/caregiver/safety-reports"),
  /** POST /caregiver/safety-reports */
  report: (dto: { visitId: string; description: string; priority?: IncidentPriority }) => http.post<SafetyIncidentRow>("/caregiver/safety-reports", dto),
  /** POST /sos — coordinates go as strings (SosDto types them `string`, no validator). */
  sos: (dto: SosInput) => http.post<SosResult>("/sos", dto),
};

export const disputesApi = {
  /** GET /disputes (plain array) */
  list: () => http.get<DisputeRow[]>("/disputes"),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => http.post<DisputeRow>("/disputes", dto),
};

export const notificationsApi = {
  /** GET /notifications?channel=&unread= — one row per channel; the app shows PUSH rows only. */
  list: (q: PageQuery & { channel?: string; unread?: boolean }) =>
    http.get<Paginated<AppNotification>>("/notifications", q),
  /** POST /notifications/read — mark the given ids (or everything before a time) as read. */
  markRead: (dto: { ids?: string[]; before?: string }) =>
    http.post<{ updated: number }>("/notifications/read", dto),
};
