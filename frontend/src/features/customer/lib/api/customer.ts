/**
 * Customer API surface. Each function maps 1:1 to a backend route (in the
 * comment).
 */
import type {
  Address,
  AppNotification,
  BookingDetail,
  CaregiverBookingStatus,
  DisputeRow,
  Me,
  MedicalOrder,
  NotificationChannel,
  NotificationPref,
  PatientProfile,
  PaymentMethod,
  PaymentStatus,
  Review,
  SafetyIncidentRow,
  SosResult,
  Visit,
} from "@shared/caregiver-types";
import type {
  AddressInput,
  CaregiverSearchItem,
  CreateBookingInput,
  CustomerBookingListItem,
  CustomerPayment,
  CustomerPaymentWithVisit,
  CustomerVisitDetail,
  EmergencyContact,
  InitiatePaymentResult,
  PatientInput,
  PromoQuote,
  PublicCaregiver,
  RescheduleInput,
  ReviewInput,
  VisitLocation,
} from "@shared/customer-types";
import type { IncidentPriority, PageQuery, Paginated, Specialty, TokenPair } from "@shared/types";
import type { BackendChatMessage } from "@shared/chat/types";
import { http } from "./http";

export const authApi = {
  /** POST /auth/otp/request — login: existing accounts only. */
  requestOtp: (phone: string) => (http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone })),
  /** POST /auth/otp/verify — login only (an unknown number now 404s; use signup for new numbers). */
  verifyOtp: (phone: string, code: string) => (http.post<TokenPair>("/auth/otp/verify", { phone, code })),
  /** POST /auth/signup — starts a sign-up: 409 if the number is already registered, else sends a SIGNUP OTP. */
  signup: (dto: { phone: string; fullName: string; email?: string; role: "CUSTOMER" | "CAREGIVER" }) =>
    http.post<{ ttlSeconds: number }>("/auth/signup", dto),
  /** POST /auth/signup/verify — completes the sign-up with the role chosen at /auth/signup; returns tokens. */
  signupVerify: (phone: string, code: string) =>
    http.post<TokenPair>("/auth/signup/verify", { phone, code }),
  /** POST /auth/logout */
  logout: (refreshToken: string) => (http.post<{ ok: boolean }>("/auth/logout", { refreshToken })),
};

export const meApi = {
  /** GET /customer/me */
  get: () => (http.get<Me>("/customer/me")),
  /** PATCH /customer/me */
  update: (dto: { fullName?: string; email?: string; preferredLanguage?: "EN" | "UR" }) =>
    http.patch<Pick<Me, "id" | "phone" | "email" | "fullName" | "preferredLanguage">>("/customer/me", dto),
};

export const contactsApi = {
  /** GET /customer/emergency-contacts */
  list: () => (http.get<EmergencyContact[]>("/customer/emergency-contacts")),
  /** POST /customer/emergency-contacts */
  add: (dto: { name: string; phone: string }) => (http.post<EmergencyContact>("/customer/emergency-contacts", dto)),
  /** DELETE /customer/emergency-contacts/:id */
  remove: (id: string) => (http.delete<{ ok: true }>(`/customer/emergency-contacts/${id}`)),
};

export const patientsApi = {
  /** GET /customer/patients */
  list: () => (http.get<PatientProfile[]>("/customer/patients")),
  /** GET /customer/patients/:id (medicalContext decrypted for the owner) */
  get: (id: string) => (http.get<PatientProfile>(`/customer/patients/${id}`)),
  /** POST /customer/patients */
  create: (dto: PatientInput) => (http.post<PatientProfile>("/customer/patients", dto)),
  /** PATCH /customer/patients/:id */
  update: (id: string, dto: Partial<PatientInput>) => (http.patch<PatientProfile>(`/customer/patients/${id}`, dto)),
  /** DELETE /customer/patients/:id (refused once the patient has bookings) */
  remove: (id: string) => (http.delete<{ ok: true }>(`/customer/patients/${id}`)),
};

export const addressesApi = {
  /** GET /customer/addresses */
  list: () => (http.get<Address[]>("/customer/addresses")),
  /** GET /customer/addresses/:id */
  get: (id: string) => (http.get<Address>(`/customer/addresses/${id}`)),
  /** POST /customer/addresses */
  create: (dto: AddressInput) => (http.post<Address>("/customer/addresses", dto)),
  /** PATCH /customer/addresses/:id (full AddressDto: addressLine, city, latitude, longitude required) */
  update: (id: string, dto: AddressInput) => (http.patch<Address>(`/customer/addresses/${id}`, dto)),
  /** DELETE /customer/addresses/:id */
  remove: (id: string) => (http.delete<{ ok: true }>(`/customer/addresses/${id}`)),
};

export const caregiversApi = {
  /** GET /caregivers?specialty=&city= (public, approved caregivers, best rated first) */
  search: (q: PageQuery & { specialty?: Specialty; city?: string }) =>
    http.get<Paginated<CaregiverSearchItem>>("/caregivers", q),
  /** GET /caregivers/:id (public profile) */
  get: (id: string) => (http.get<PublicCaregiver>(`/caregivers/${id}`)),
};

export const promosApi = {
  /** GET /promos/quote?code=&caregiverId= — preview a promo discount before booking. */
  quote: (code: string, caregiverId: string) =>
    http.get<PromoQuote>("/promos/quote", { code, caregiverId }),
};

export const bookingsApi = {
  /** POST /customer/bookings */
  create: (dto: CreateBookingInput) => (http.post<BookingDetail>("/customer/bookings", dto)),
  /** GET /customer/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) =>
    http.get<Paginated<CustomerBookingListItem>>("/customer/bookings", q),
  /** GET /customer/bookings/:id */
  get: (id: string) => (http.get<BookingDetail>(`/customer/bookings/${id}`)),
  /** PATCH /customer/bookings/:id/cancel */
  cancel: (id: string, reason?: string) => (http.patch<BookingDetail>(`/customer/bookings/${id}/cancel`, reason ? { reason } : {})),
  /** PATCH /customer/bookings/:id/reschedule (one visit) */
  reschedule: (id: string, dto: RescheduleInput) => (http.patch<Visit>(`/customer/bookings/${id}/reschedule`, dto)),
  /** POST /customer/bookings/:id/prescriptions (multipart: file) */
  uploadPrescription: (id: string, file: File) =>
    http.upload<{ id: string; bookingId: string; mimeType: string; sizeBytes: number; createdAt: string }>(`/customer/bookings/${id}/prescriptions`, file),
  /** GET /customer/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (id: string, documentId: string) =>
    http.get<{ url: string; mimeType: string }>(`/customer/bookings/${id}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /customer/visits/:id */
  get: (id: string) => (http.get<CustomerVisitDetail>(`/customer/visits/${id}`)),
  /** POST /customer/visits/:id/review */
  review: (id: string, dto: ReviewInput) => (http.post<Review>(`/customer/visits/${id}/review`, dto)),
  /** POST /customer/visits/:id/safety-reports */
  report: (id: string, dto: { description: string; priority?: IncidentPriority }) =>
    http.post<SafetyIncidentRow>(`/customer/visits/${id}/safety-reports`, dto),
  /** POST /sos */
  sos: (dto: { visitId: string; note?: string }) => (http.post<SosResult>("/sos", dto)),
  /** GET /customer/visits/:id/medical-orders — the doctor's diagnosis/prescription/lab-test records. */
  medicalOrders: (id: string) => (http.get<MedicalOrder[]>(`/customer/visits/${id}/medical-orders`)),
  /** GET /customer/visits/:id/location — last-known caregiver fix while EN_ROUTE (null once checked in / no fix yet). */
  location: (id: string) => (http.get<VisitLocation | null>(`/customer/visits/${id}/location`)),
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

export const paymentsApi = {
  /**
   * POST /customer/payments. CASH returns the bare PENDING payment (settles when
   * the caregiver confirms receipt). A gateway method returns { payment, checkoutUrl }:
   * CARD opens Stripe Checkout, and settlement happens via the Stripe webhook.
   * `amount` is omitted so the backend charges rateSnapshot - discountAmount.
   */
  initiate: (dto: { visitId: string; method: PaymentMethod }): Promise<InitiatePaymentResult> =>
    http.post<InitiatePaymentResult>("/customer/payments", dto),
  /** GET /customer/payments?status=&page=&limit= */
  list: (q: PageQuery & { status?: PaymentStatus }) =>
    http.get<Paginated<CustomerPaymentWithVisit>>("/customer/payments", q),
  /** GET /customer/payments/:id (same include as the list) */
  get: (id: string) => (http.get<CustomerPaymentWithVisit>(`/customer/payments/${id}`)),
  /** PATCH /customer/payments/:id/cancel — abandon a PENDING payment so another method can be used. */
  cancel: (id: string) => (http.patch<CustomerPayment>(`/customer/payments/${id}/cancel`, {})),
  /** POST /customer/payments/:id/confirm-cash — customer confirms they handed the cash over (Phase 15, two-sided). */
  confirmCash: (id: string) => (http.post<CustomerPayment>(`/customer/payments/${id}/confirm-cash`, {})),
  /** GET /customer/payments/:id/receipt — PDF blob (Phase 15; real backend only). */
  receipt: (id: string) => http.download(`/customer/payments/${id}/receipt`),
};

export const disputesApi = {
  /** GET /disputes: disputes raised by or against the current user, newest first (no pagination). */
  list: () => (http.get<DisputeRow[]>("/disputes")),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => (http.post<DisputeRow>("/disputes", dto)),
};

export const notificationsApi = {
  /** GET /notifications?channel=&unread= — the app shows PUSH rows only. */
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
};
