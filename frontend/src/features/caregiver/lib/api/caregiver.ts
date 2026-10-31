/**
 * Caregiver API surface. Each function maps 1:1 to a backend route (in the
 * comment).
 */
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
  CreateMedicalOrderInput,
  MedicalOrder,
  CaregiverVisitListItem,
  CheckInInput,
  DisputeRow,
  Earnings,
  Me,
  MyCaregiverProfile,
  NotificationChannel,
  NotificationPref,
  PayoutAccountInput,
  PayoutRequestRow,
  RegisterCaregiverInput,
  SafetyIncidentRow,
  ServiceAreaInput,
  SosInput,
  SosResult,
  UpdateCaregiverProfileInput,
  Visit,
} from "@shared/caregiver-types";
import type { CaregiverDocument, DocType, IncidentPriority, PageQuery, Paginated, PayoutAccount, PayoutStatus, TokenPair, VisitStatus } from "@shared/types";
import type { BackendChatMessage } from "@shared/chat/types";
import { http } from "./http";

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) => (http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone })),
  /** POST /auth/otp/verify — always yields a CUSTOMER for new numbers. */
  verifyOtp: (phone: string, code: string) => (http.post<TokenPair>("/auth/otp/verify", { phone, code })),
  /** POST /auth/refresh — needed right after register so the token carries CAREGIVER. */
  refresh: (refreshToken: string) => (http.post<TokenPair>("/auth/refresh", { refreshToken })),
  /** POST /auth/logout */
  logout: (refreshToken: string) => (http.post<{ ok: boolean }>("/auth/logout", { refreshToken })),
};

export const meApi = {
  /** GET /customer/me — works for any role; tells us if a caregiver profile exists. */
  get: () => (http.get<Me>("/customer/me")),
  /** PATCH /customer/me — the only way to set the display name. */
  update: (dto: { fullName?: string; email?: string; preferredLanguage?: "EN" | "UR" }) => (http.patch<Pick<Me, "id" | "phone" | "email" | "fullName" | "preferredLanguage">>("/customer/me", dto)),
};

export const profileApi = {
  /** POST /caregiver/register */
  register: (dto: RegisterCaregiverInput) => (http.post<CaregiverProfileRow>("/caregiver/register", dto)),
  /** GET /caregiver/profile */
  get: () => (http.get<MyCaregiverProfile>("/caregiver/profile")),
  /** PATCH /caregiver/profile */
  update: (dto: UpdateCaregiverProfileInput) => (http.patch<CaregiverProfileRow>("/caregiver/profile", dto)),
  /** POST /caregiver/documents (multipart: file + type) */
  uploadDocument: (file: File, type: DocType) => (http.upload<CaregiverDocument>("/caregiver/documents", file, { type })),
  /** GET /caregiver/documents/:id/url */
  documentUrl: (id: string) => (http.get<{ url: string }>(`/caregiver/documents/${id}/url`)),
  /** POST /caregiver/photo (multipart: file) */
  uploadPhoto: (file: File) => (http.upload<{ photoKey: string }>("/caregiver/photo", file)),
  /** GET /caregiver/photo/url — 404 "No photo uploaded" when photoKey is null. */
  photoUrl: () => (http.get<{ url: string }>("/caregiver/photo/url")),
  /** PATCH /caregiver/location — share live location so nearby families can book an immediate visit. */
  updateLocation: (lat: number, lng: number) => (http.patch<void>("/caregiver/location", { lat, lng })),
  /** GET /caregiver/service-areas — sub-city coverage zones (empty = whole city). */
  serviceAreas: () => (http.get<CaregiverServiceArea[]>("/caregiver/service-areas")),
  /** PUT /caregiver/service-areas — full replace of the coverage zones (empty list = whole-city coverage). */
  setServiceAreas: (areas: ServiceAreaInput[]) =>
    http.put<CaregiverServiceArea[]>("/caregiver/service-areas", { areas }),
};

export const availabilityApi = {
  /** GET /caregiver/availability */
  get: () => (http.get<Availability>("/caregiver/availability")),
  /** PUT /caregiver/availability — full replace. */
  put: (rules: AvailabilityRuleInput[]) => (http.put<Availability>("/caregiver/availability", { rules })),
  /** POST /caregiver/availability/blocks */
  addBlock: (dto: { startDate: string; endDate: string; reason?: string }) => (http.post<AvailabilityBlock>("/caregiver/availability/blocks", dto)),
  /** DELETE /caregiver/availability/blocks/:id */
  deleteBlock: (id: string) => (http.delete<{ ok: true }>(`/caregiver/availability/blocks/${id}`)),
};

export const bookingsApi = {
  /** GET /caregiver/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) => (http.get<Paginated<CaregiverBookingListItem>>("/caregiver/bookings", q)),
  /** POST /caregiver/bookings/:id/accept */
  accept: (id: string) => (http.post<BookingDetail>(`/caregiver/bookings/${id}/accept`)),
  /** POST /caregiver/bookings/:id/decline */
  decline: (id: string, reason?: string) => (http.post<BookingDetail>(`/caregiver/bookings/${id}/decline`, reason ? { reason } : {})),
  /** GET /caregiver/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (bookingId: string, documentId: string) =>
    http.get<{ url: string; mimeType: string }>(`/caregiver/bookings/${bookingId}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /caregiver/visits?status=&date=&from=&to=&sort= (date/from/to are YYYY-MM-DD; sort by scheduled date). */
  list: (q: PageQuery & { status?: VisitStatus; date?: string; from?: string; to?: string; sort?: "asc" | "desc" }) =>
    http.get<Paginated<CaregiverVisitListItem>>("/caregiver/visits", q),
  /** GET /caregiver/visits/:id */
  get: (id: string) => (http.get<CaregiverVisitDetail>(`/caregiver/visits/${id}`)),
  /** POST /caregiver/visits/:id/en-route */
  enRoute: (id: string) => (http.post<Visit>(`/caregiver/visits/${id}/en-route`)),
  /** POST /caregiver/visits/:id/location — stream the caregiver's GPS fix to the customer while EN_ROUTE. */
  postLocation: (id: string, lat: number, lng: number) =>
    http.post<{ ok: true }>(`/caregiver/visits/${id}/location`, { lat, lng }),
  /** POST /caregiver/visits/:id/check-in-otp — code is SMSed to the customer. */
  checkInOtp: (id: string) => (http.post<{ ttlSeconds: number; sentTo: string }>(`/caregiver/visits/${id}/check-in-otp`)),
  /** POST /caregiver/visits/:id/check-in */
  checkIn: (id: string, dto: CheckInInput) => (http.post<Visit>(`/caregiver/visits/${id}/check-in`, dto)),
  /** POST /caregiver/visits/:id/check-out */
  checkOut: (id: string, dto: CheckInInput) => (http.post<Visit>(`/caregiver/visits/${id}/check-out`, dto)),
  /** POST /caregiver/visits/:id/note — completes the visit. */
  note: (id: string, summary: string) => (http.post<CaregiverVisitDetail>(`/caregiver/visits/${id}/note`, { summary })),
};

export const medicalOrdersApi = {
  /** GET /caregiver/visits/:visitId/medical-orders — diagnosis/prescription/lab-test records (newest first). */
  list: (visitId: string) => (http.get<MedicalOrder[]>(`/caregiver/visits/${visitId}/medical-orders`)),
  /** POST /caregiver/visits/:visitId/medical-orders — doctor-only; the customer is notified. */
  create: (visitId: string, dto: CreateMedicalOrderInput) =>
    http.post<MedicalOrder>(`/caregiver/visits/${visitId}/medical-orders`, dto),
};

export const paymentsApi = {
  /** POST /caregiver/payments/:id/confirm-cash — the caregiver's half of two-sided cash (Phase 15). */
  confirmCash: (paymentId: string) =>
    http.post<CaregiverPaymentRow>(`/caregiver/payments/${paymentId}/confirm-cash`),
  /** GET /caregiver/payments/:id/receipt — PDF blob (Phase 15; real backend only). */
  receipt: (id: string) => http.download(`/caregiver/payments/${id}/receipt`),
};

export const chatApi = {
  /** GET /bookings/:bookingId/messages — newest first. */
  list: (bookingId: string) =>
    http.get<Paginated<BackendChatMessage>>(`/bookings/${bookingId}/messages`, { limit: 100 }),
  /** POST /bookings/:bookingId/messages */
  send: (bookingId: string, body: string, replyToId?: string) =>
    http.post<BackendChatMessage>(`/bookings/${bookingId}/messages`, { body, ...(replyToId ? { replyToId } : {}) }),
  /** PATCH /bookings/:bookingId/messages/read */
  markRead: (bookingId: string) => (http.patch<{ updated: number }>(`/bookings/${bookingId}/messages/read`)),
  /** POST /bookings/:bookingId/messages/:id/reactions — toggle a reaction emoji. */
  react: (bookingId: string, messageId: string, emoji: string) =>
    http.post<unknown>(`/bookings/${bookingId}/messages/${messageId}/reactions`, { emoji }).then(() => undefined),
  /** DELETE /bookings/:bookingId/messages/:id — soft-delete your own message. */
  deleteMessage: (bookingId: string, messageId: string) =>
    http.delete<unknown>(`/bookings/${bookingId}/messages/${messageId}`).then(() => undefined),
  /** Resumable media upload: init → 2 MB chunks → complete (creates the media message). */
  uploadMedia: async (
    bookingId: string,
    file: Blob,
    opts?: { fileName?: string; caption?: string; replyToId?: string; onProgress?: (fraction: number) => void },
  ): Promise<BackendChatMessage> => {
    const init = await http.post<{ uploadId: string; totalBytes: number }>(`/bookings/${bookingId}/media/uploads`, {
      mimeType: file.type || "application/octet-stream",
      totalBytes: file.size,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
    });
    const CHUNK = 2 * 1024 * 1024;
    const total = file.size || 1;
    let index = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK, index += 1) {
      const form = new FormData();
      form.append("chunk", file.slice(offset, offset + CHUNK), opts?.fileName ?? "chunk");
      await http.put<unknown>(`/bookings/${bookingId}/media/uploads/${init.uploadId}/chunks/${index}`, form);
      opts?.onProgress?.(Math.min(1, (offset + CHUNK) / total));
    }
    return http.post<BackendChatMessage>(`/bookings/${bookingId}/media/uploads/${init.uploadId}/complete`, {
      ...(opts?.caption ? { body: opts.caption } : {}),
      ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
    });
  },
};

export const moneyApi = {
  /** GET /caregiver/earnings */
  earnings: () => (http.get<Earnings>("/caregiver/earnings")),
  /** GET /caregiver/payouts?status= */
  payouts: (q: PageQuery & { status?: PayoutStatus }) => (http.get<Paginated<CaregiverPayoutRequest>>("/caregiver/payouts", q)),
  /** POST /caregiver/payouts */
  requestPayout: (dto: { payoutAccountId: string; amount: number }) => (http.post<PayoutRequestRow>("/caregiver/payouts", dto)),
  /** GET /caregiver/payout-accounts */
  accounts: () => (http.get<PayoutAccount[]>("/caregiver/payout-accounts")),
  /** POST /caregiver/payout-accounts */
  createAccount: (dto: PayoutAccountInput) => (http.post<PayoutAccount>("/caregiver/payout-accounts", dto)),
  /** PATCH /caregiver/payout-accounts/:id */
  updateAccount: (id: string, dto: Partial<PayoutAccountInput>) => (http.patch<PayoutAccount>(`/caregiver/payout-accounts/${id}`, dto)),
  /** DELETE /caregiver/payout-accounts/:id */
  deleteAccount: (id: string) => (http.delete<{ ok: true }>(`/caregiver/payout-accounts/${id}`)),
  /** POST /caregiver/payouts/:id/confirm-received — Phase 15: caregiver confirms the transfer arrived (TRANSFERRED → PAID). */
  confirmPayoutReceived: (id: string) =>
    http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/confirm-received`, {}),
  /** POST /caregiver/payouts/:id/report-not-received — Phase 15: money not arrived (stays TRANSFERRED, issueNote set). */
  reportPayoutNotReceived: (id: string, note: string) =>
    http.post<PayoutRequestRow>(`/caregiver/payouts/${id}/report-not-received`, { note }),
  /** GET /caregiver/payouts/:id/receipt — transfer PDF blob (Phase 15; real backend only). */
  payoutReceipt: (id: string) => http.download(`/caregiver/payouts/${id}/receipt`),
};

export const safetyApi = {
  /** GET /caregiver/safety-reports (plain array) */
  list: () => (http.get<SafetyIncidentRow[]>("/caregiver/safety-reports")),
  /** POST /caregiver/safety-reports */
  report: (dto: { visitId: string; description: string; priority?: IncidentPriority }) => (http.post<SafetyIncidentRow>("/caregiver/safety-reports", dto)),
  /** POST /sos — coordinates go as strings (SosDto types them `string`, no validator). */
  sos: (dto: SosInput) => (http.post<SosResult>("/sos", dto)),
};

export const disputesApi = {
  /** GET /disputes (plain array) */
  list: () => (http.get<DisputeRow[]>("/disputes")),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => (http.post<DisputeRow>("/disputes", dto)),
};

export const notificationsApi = {
  /** GET /notifications?channel=&unread= — one row per channel; the app shows PUSH rows only. */
  list: (q: PageQuery & { channel?: string; unread?: boolean }) =>
    http.get<Paginated<AppNotification>>("/notifications", q),
  /** POST /notifications/read — mark the given ids (or everything before a time) as read. */
  markRead: (dto: { ids?: string[]; before?: string }) =>
    http.post<{ updated: number }>("/notifications/read", dto),
  /** GET /notifications/unread-count — Phase 15. */
  unreadCount: () => (http.get<{ unread: number }>("/notifications/unread-count")),
  /** GET /notifications/preferences — per-channel opt-in/out (all channels, default enabled). */
  prefs: () => http.get<NotificationPref[]>("/notifications/preferences"),
  /** PATCH /notifications/preferences — opt one channel in/out (SOS always delivered). */
  setPref: (channel: NotificationChannel, enabled: boolean) =>
    http.patch<NotificationPref[]>("/notifications/preferences", { channel, enabled }),
  /** GET /notifications/push/public-key — VAPID key for Web Push (enabled=false until the server has keys). */
  pushPublicKey: () => http.get<{ enabled: boolean; vapidPublicKey: string | null }>("/notifications/push/public-key"),
  /** POST /notifications/push/subscribe — store this browser's push subscription. */
  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    http.post<unknown>("/notifications/push/subscribe", sub).then(() => undefined),
};
