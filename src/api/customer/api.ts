/**
 * Customer API surface. Each function maps 1:1 to a backend route (in the
 * comment).
 */
import type { UploadFile } from "../http";
import type {
  Address,
  AppNotification,
  BookingDetail,
  CaregiverBookingStatus,
  DisputeRow,
  Me,
  MedicalOrder,
  PatientProfile,
  PaymentMethod,
  PaymentStatus,
  Review,
  SafetyIncidentRow,
  SosResult,
  Visit,
} from "../types";
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
  NearbyCaregiver,
  PatientInput,
  PromoQuote,
  PublicCaregiver,
  RescheduleInput,
  ReviewInput,
} from "../types";
import type { IncidentPriority, PageQuery, Paginated, Specialty, TokenPair } from "../types";
import { http } from "./http";

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) => http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone }),
  /** POST /auth/otp/verify — new numbers become CUSTOMER accounts. */
  verifyOtp: (phone: string, code: string) => http.post<TokenPair>("/auth/otp/verify", { phone, code }),
  /** POST /auth/signup — registers a new account (409 if the number already exists). */
  signup: (input: { phone: string; fullName: string; email?: string; role: "CUSTOMER" | "CAREGIVER" }) =>
    http.post<{ ttlSeconds: number }>("/auth/signup", input),
  /** POST /auth/signup/verify — verifies the signup OTP and issues tokens for the chosen role. */
  signupVerify: (phone: string, code: string) => http.post<TokenPair>("/auth/signup/verify", { phone, code }),
  /** POST /auth/logout */
  logout: (refreshToken: string) => http.post<{ ok: boolean }>("/auth/logout", { refreshToken }),
};

export const meApi = {
  /** GET /customer/me */
  get: () => http.get<Me>("/customer/me"),
  /** PATCH /customer/me */
  update: (dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) =>
    http.patch<Pick<Me, "id" | "phone" | "fullName" | "preferredLanguage">>("/customer/me", dto),
};

export const contactsApi = {
  /** GET /customer/emergency-contacts */
  list: () => http.get<EmergencyContact[]>("/customer/emergency-contacts"),
  /** POST /customer/emergency-contacts */
  add: (dto: { name: string; phone: string }) => http.post<EmergencyContact>("/customer/emergency-contacts", dto),
  /** DELETE /customer/emergency-contacts/:id */
  remove: (id: string) => http.delete<{ ok: true }>(`/customer/emergency-contacts/${id}`),
};

export const patientsApi = {
  /** GET /customer/patients */
  list: () => http.get<PatientProfile[]>("/customer/patients"),
  /** GET /customer/patients/:id (medicalContext decrypted for the owner) */
  get: (id: string) => http.get<PatientProfile>(`/customer/patients/${id}`),
  /** POST /customer/patients */
  create: (dto: PatientInput) => http.post<PatientProfile>("/customer/patients", dto),
  /** PATCH /customer/patients/:id */
  update: (id: string, dto: Partial<PatientInput>) => http.patch<PatientProfile>(`/customer/patients/${id}`, dto),
  /** DELETE /customer/patients/:id (refused once the patient has bookings) */
  remove: (id: string) => http.delete<{ ok: true }>(`/customer/patients/${id}`),
};

export const addressesApi = {
  /** GET /customer/addresses */
  list: () => http.get<Address[]>("/customer/addresses"),
  /** GET /customer/addresses/:id */
  get: (id: string) => http.get<Address>(`/customer/addresses/${id}`),
  /** POST /customer/addresses */
  create: (dto: AddressInput) => http.post<Address>("/customer/addresses", dto),
  /** PATCH /customer/addresses/:id (full AddressDto: addressLine, city, latitude, longitude required) */
  update: (id: string, dto: AddressInput) => http.patch<Address>(`/customer/addresses/${id}`, dto),
  /** DELETE /customer/addresses/:id */
  remove: (id: string) => http.delete<{ ok: true }>(`/customer/addresses/${id}`),
};

export const caregiversApi = {
  /** GET /caregivers?specialty=&city= (public, approved caregivers, best rated first) */
  search: (q: PageQuery & { specialty?: Specialty; city?: string }) =>
    http.get<Paginated<CaregiverSearchItem>>("/caregivers", q),
  /** GET /caregivers/:id (public profile) */
  get: (id: string) => http.get<PublicCaregiver>(`/caregivers/${id}`),
  /** GET /caregivers/nearby?lat&lng&specialty — nearby-now (emergency) search, nearest first (auth required). */
  nearbyNow: (lat: number, lng: number, specialty?: Specialty) =>
    http.get<Paginated<NearbyCaregiver>>("/caregivers/nearby", { lat, lng, limit: 20, ...(specialty ? { specialty } : {}) }),
};

export const promosApi = {
  /** GET /promos/quote?code=&caregiverId= — preview a promo discount before booking. */
  quote: (code: string, caregiverId: string) =>
    http.get<PromoQuote>("/promos/quote", { code, caregiverId }),
};

export const bookingsApi = {
  /** POST /customer/bookings */
  create: (dto: CreateBookingInput) => http.post<BookingDetail>("/customer/bookings", dto),
  /** GET /customer/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) =>
    http.get<Paginated<CustomerBookingListItem>>("/customer/bookings", q),
  /** GET /customer/bookings/:id */
  get: (id: string) => http.get<BookingDetail>(`/customer/bookings/${id}`),
  /** PATCH /customer/bookings/:id/cancel */
  cancel: (id: string, reason?: string) => http.patch<BookingDetail>(`/customer/bookings/${id}/cancel`, reason ? { reason } : {}),
  /** PATCH /customer/bookings/:id/reschedule (one visit) */
  reschedule: (id: string, dto: RescheduleInput) => http.patch<Visit>(`/customer/bookings/${id}/reschedule`, dto),
  /** POST /customer/bookings/:id/prescriptions (multipart: file) */
  uploadPrescription: (id: string, file: UploadFile) =>
    http.upload<{ id: string; bookingId: string; mimeType: string; sizeBytes: number; createdAt: string }>(`/customer/bookings/${id}/prescriptions`, file),
  /** GET /customer/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (id: string, documentId: string) =>
    http.get<{ url: string; mimeType: string }>(`/customer/bookings/${id}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /customer/visits/:id */
  get: (id: string) => http.get<CustomerVisitDetail>(`/customer/visits/${id}`),
  /** POST /customer/visits/:id/review */
  review: (id: string, dto: ReviewInput) => http.post<Review>(`/customer/visits/${id}/review`, dto),
  /** POST /customer/visits/:id/safety-reports */
  report: (id: string, dto: { description: string; priority?: IncidentPriority }) =>
    http.post<SafetyIncidentRow>(`/customer/visits/${id}/safety-reports`, dto),
  /** POST /sos */
  sos: (dto: { visitId: string; note?: string }) => http.post<SosResult>("/sos", dto),
  /** GET /customer/visits/:id/medical-orders — the doctor's diagnosis / prescription / lab records. */
  medicalOrders: (id: string) => http.get<MedicalOrder[]>(`/customer/visits/${id}/medical-orders`),
  /** GET /customer/visits/:id/medical-orders/:orderId/pdf — branded prescription PDF (downloads + opens). */
  openMedicalOrderPdf: (id: string, orderId: string) =>
    http.openFile(`/customer/visits/${id}/medical-orders/${orderId}/pdf`, `care-sath-prescription-${orderId.slice(0, 8)}.pdf`),
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
  /**
   * POST /customer/payments/:id/confirm-cash — the customer's half of a cash
   * payment; it turns PAID once the caregiver has confirmed too.
   */
  confirmCash: (id: string, note?: string) => http.post<CustomerPayment>(`/customer/payments/${id}/confirm-cash`, note ? { note } : {}),
  /** POST /customer/payments/:id/confirm-stripe — settle-on-return after Stripe checkout (idempotent; webhook is the fallback). */
  confirmStripe: (id: string) => http.post<CustomerPaymentWithVisit>(`/customer/payments/${id}/confirm-stripe`),
  /** GET /customer/payments/:id/receipt — PDF (PAID only), opened in the phone's viewer. */
  openReceipt: (id: string) => http.openFile(`/customer/payments/${id}/receipt`, `care-sath-receipt-${id.slice(0, 8)}.pdf`),
  /** GET /customer/payments?status=&page=&limit= */
  list: (q: PageQuery & { status?: PaymentStatus }) =>
    http.get<Paginated<CustomerPaymentWithVisit>>("/customer/payments", q),
  /** GET /customer/payments/:id (same include as the list) */
  get: (id: string) => http.get<CustomerPaymentWithVisit>(`/customer/payments/${id}`),
  /** PATCH /customer/payments/:id/cancel — abandon a PENDING payment so another method can be used. */
  cancel: (id: string) => http.patch<CustomerPayment>(`/customer/payments/${id}/cancel`, {}),
};

export const disputesApi = {
  /** GET /disputes: disputes raised by or against the current user, newest first (no pagination). */
  list: () => http.get<DisputeRow[]>("/disputes"),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => http.post<DisputeRow>("/disputes", dto),
};

export const notificationsApi = {
  /** GET /notifications?channel=&unread= — the app shows PUSH rows only. */
  list: (q: PageQuery & { channel?: string; unread?: boolean }) =>
    http.get<Paginated<AppNotification>>("/notifications", q),
  /** POST /notifications/read — mark the given ids (or everything before a time) as read. */
  markRead: (dto: { ids?: string[]; before?: string }) =>
    http.post<{ updated: number }>("/notifications/read", dto),
};
