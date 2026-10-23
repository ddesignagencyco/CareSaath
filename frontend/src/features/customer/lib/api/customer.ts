/**
 * Customer API surface. Each function maps 1:1 to a backend route (in the
 * comment). With USE_MOCKS on, calls go to the in-browser mock instead.
 */
import type {
  Address,
  AppNotification,
  BookingDetail,
  CaregiverBookingStatus,
  DisputeRow,
  Me,
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
  CustomerPaymentWithVisit,
  CustomerVisitDetail,
  EmergencyContact,
  InitiatePaymentResult,
  PatientInput,
  PublicCaregiver,
  RescheduleInput,
  ReviewInput,
} from "@shared/customer-types";
import type { IncidentPriority, PageQuery, Paginated, Specialty, TokenPair } from "@shared/types";
import * as mock from "../mock/handlers";
import { http, USE_MOCKS } from "./http";

const M = USE_MOCKS;

export const authApi = {
  /** POST /auth/otp/request */
  requestOtp: (phone: string) => (M ? mock.requestOtp(phone) : http.post<{ ttlSeconds: number }>("/auth/otp/request", { phone })),
  /** POST /auth/otp/verify — new numbers become CUSTOMER accounts. */
  verifyOtp: (phone: string, code: string) => (M ? mock.verifyOtp(phone, code) : http.post<TokenPair>("/auth/otp/verify", { phone, code })),
  /** POST /auth/logout */
  logout: (refreshToken: string) => (M ? Promise.resolve({ ok: true }) : http.post<{ ok: boolean }>("/auth/logout", { refreshToken })),
};

export const meApi = {
  /** GET /customer/me */
  get: () => (M ? mock.me() : http.get<Me>("/customer/me")),
  /** PATCH /customer/me */
  update: (dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) =>
    M ? mock.updateMe(dto) : http.patch<Pick<Me, "id" | "phone" | "fullName" | "preferredLanguage">>("/customer/me", dto),
};

export const contactsApi = {
  /** GET /customer/emergency-contacts */
  list: () => (M ? mock.listContacts() : http.get<EmergencyContact[]>("/customer/emergency-contacts")),
  /** POST /customer/emergency-contacts */
  add: (dto: { name: string; phone: string }) => (M ? mock.addContact(dto) : http.post<EmergencyContact>("/customer/emergency-contacts", dto)),
  /** DELETE /customer/emergency-contacts/:id */
  remove: (id: string) => (M ? mock.deleteContact(id) : http.delete<{ ok: true }>(`/customer/emergency-contacts/${id}`)),
};

export const patientsApi = {
  /** GET /customer/patients */
  list: () => (M ? mock.listPatients() : http.get<PatientProfile[]>("/customer/patients")),
  /** GET /customer/patients/:id (medicalContext decrypted for the owner) */
  get: (id: string) => (M ? mock.getPatient(id) : http.get<PatientProfile>(`/customer/patients/${id}`)),
  /** POST /customer/patients */
  create: (dto: PatientInput) => (M ? mock.createPatient(dto) : http.post<PatientProfile>("/customer/patients", dto)),
  /** PATCH /customer/patients/:id */
  update: (id: string, dto: Partial<PatientInput>) => (M ? mock.updatePatient(id, dto) : http.patch<PatientProfile>(`/customer/patients/${id}`, dto)),
  /** DELETE /customer/patients/:id (refused once the patient has bookings) */
  remove: (id: string) => (M ? mock.deletePatient(id) : http.delete<{ ok: true }>(`/customer/patients/${id}`)),
};

export const addressesApi = {
  /** GET /customer/addresses */
  list: () => (M ? mock.listAddresses() : http.get<Address[]>("/customer/addresses")),
  /** GET /customer/addresses/:id */
  get: (id: string) => (M ? mock.getAddress(id) : http.get<Address>(`/customer/addresses/${id}`)),
  /** POST /customer/addresses */
  create: (dto: AddressInput) => (M ? mock.createAddress(dto) : http.post<Address>("/customer/addresses", dto)),
  /** PATCH /customer/addresses/:id (full AddressDto: addressLine, city, latitude, longitude required) */
  update: (id: string, dto: AddressInput) => (M ? mock.updateAddress(id, dto) : http.patch<Address>(`/customer/addresses/${id}`, dto)),
  /** DELETE /customer/addresses/:id */
  remove: (id: string) => (M ? mock.deleteAddress(id) : http.delete<{ ok: true }>(`/customer/addresses/${id}`)),
};

export const caregiversApi = {
  /** GET /caregivers?specialty=&city= (public, approved caregivers, best rated first) */
  search: (q: PageQuery & { specialty?: Specialty; city?: string }) =>
    M ? mock.searchCaregivers(q) : http.get<Paginated<CaregiverSearchItem>>("/caregivers", q),
  /** GET /caregivers/:id (public profile) */
  get: (id: string) => (M ? mock.getCaregiver(id) : http.get<PublicCaregiver>(`/caregivers/${id}`)),
};

export const bookingsApi = {
  /** POST /customer/bookings */
  create: (dto: CreateBookingInput) => (M ? mock.createBooking(dto) : http.post<BookingDetail>("/customer/bookings", dto)),
  /** GET /customer/bookings?status= */
  list: (q: PageQuery & { status?: CaregiverBookingStatus }) =>
    M ? mock.listBookings(q) : http.get<Paginated<CustomerBookingListItem>>("/customer/bookings", q),
  /** GET /customer/bookings/:id */
  get: (id: string) => (M ? mock.getBooking(id) : http.get<BookingDetail>(`/customer/bookings/${id}`)),
  /** PATCH /customer/bookings/:id/cancel */
  cancel: (id: string, reason?: string) => (M ? mock.cancelBooking(id, reason) : http.patch<BookingDetail>(`/customer/bookings/${id}/cancel`, reason ? { reason } : {})),
  /** PATCH /customer/bookings/:id/reschedule (one visit) */
  reschedule: (id: string, dto: RescheduleInput) => (M ? mock.reschedule(id, dto) : http.patch<Visit>(`/customer/bookings/${id}/reschedule`, dto)),
  /** POST /customer/bookings/:id/prescriptions (multipart: file) */
  uploadPrescription: (id: string, file: File) =>
    M
      ? mock.uploadPrescription(id, file)
      : http.upload<{ id: string; bookingId: string; mimeType: string; sizeBytes: number; createdAt: string }>(`/customer/bookings/${id}/prescriptions`, file),
  /** GET /customer/bookings/:id/prescriptions/:documentId */
  prescriptionUrl: (id: string, documentId: string) =>
    M ? mock.prescriptionUrl(id, documentId) : http.get<{ url: string; mimeType: string }>(`/customer/bookings/${id}/prescriptions/${documentId}`),
};

export const visitsApi = {
  /** GET /customer/visits/:id */
  get: (id: string) => (M ? mock.getVisit(id) : http.get<CustomerVisitDetail>(`/customer/visits/${id}`)),
  /** POST /customer/visits/:id/review */
  review: (id: string, dto: ReviewInput) => (M ? mock.review(id, dto) : http.post<Review>(`/customer/visits/${id}/review`, dto)),
  /** POST /customer/visits/:id/safety-reports */
  report: (id: string, dto: { description: string; priority?: IncidentPriority }) =>
    M ? mock.reportIncident(id, dto) : http.post<SafetyIncidentRow>(`/customer/visits/${id}/safety-reports`, dto),
  /** POST /sos */
  sos: (dto: { visitId: string; note?: string }) => (M ? mock.sos(dto) : http.post<SosResult>("/sos", dto)),
};

export const paymentsApi = {
  /**
   * POST /customer/payments. CASH returns the bare PENDING payment (settles when
   * the caregiver confirms receipt). A gateway method returns { payment, checkoutUrl }:
   * CARD opens Stripe Checkout, and settlement happens via the Stripe webhook.
   * `amount` is omitted so the backend charges rateSnapshot - discountAmount.
   */
  initiate: (dto: { visitId: string; method: PaymentMethod }): Promise<InitiatePaymentResult> =>
    M ? mock.initiatePayment(dto) : http.post<InitiatePaymentResult>("/customer/payments", dto),
  /** GET /customer/payments?status=&page=&limit= */
  list: (q: PageQuery & { status?: PaymentStatus }) =>
    M ? mock.listPayments(q) : http.get<Paginated<CustomerPaymentWithVisit>>("/customer/payments", q),
  /** GET /customer/payments/:id (same include as the list) */
  get: (id: string) => (M ? mock.getPayment(id) : http.get<CustomerPaymentWithVisit>(`/customer/payments/${id}`)),
};

export const disputesApi = {
  /** GET /disputes: disputes raised by or against the current user, newest first (no pagination). */
  list: () => (M ? mock.listDisputes() : http.get<DisputeRow[]>("/disputes")),
  /** POST /disputes */
  raise: (dto: { visitId: string; description: string }) => (M ? mock.raiseDispute(dto) : http.post<DisputeRow>("/disputes", dto)),
};

export const notificationsApi = {
  /** GET /notifications — the app shows PUSH rows only. */
  list: (q: PageQuery) => (M ? mock.listNotifications(q) : http.get<Paginated<AppNotification>>("/notifications", q)),
};
