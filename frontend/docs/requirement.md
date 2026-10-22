# Backend requirements from the frontend wiring

Wiring the frontend to the backend (`frontend/` against `backend/`, API v1), 22 October 2026.

The frontend now calls every route in the OpenAPI spec (78 paths) through its API layer (`src/features/*/lib/api/*.ts`). The one exception is `POST /payments/webhook/{provider}`, which only the payment gateway calls. Each request and response type was checked against the backend source (controller → service → Prisma `select`/`include`). The read routes were also called on the local backend to compare real responses.

The items below are things the **backend** must change or add. Nothing outside `frontend/` was modified. For each item:

- **Needed:** the backend change. Backend paths are relative to `backend/src/`.
- **Frontend today:** what the UI does until the change lands.

Priority:

- **P0:** a flow is broken, or data or security is at risk.
- **P1:** a feature is incomplete or wrong for users.
- **P2:** correctness or polish.

---

## P0: broken flows, security, data

### 1. Encrypted fields can't be decrypted (CNIC, medical context, payout account numbers)
- **Problem:** each module builds its key in top-level code:
  - `const MEDICAL_KEY = deriveKey('MEDICAL_ENCRYPTION_KEY', 'caresaath-dev-medical-key')` in `patients/patients.module.ts` and `visits/visits.module.ts`
  - `CNIC_KEY` in `caregivers/caregivers.module.ts` and `verification/verification.module.ts`
  - `ENC_KEY` in `payouts/payouts.module.ts`

  These lines run when `app.module.ts` imports the modules, which is **before** `ConfigModule.forRoot({ envFilePath: ['../.env', '.env'] })` loads the root `.env`. The running API therefore encrypts and decrypts with the *fallback* keys. `prisma/seed.mjs` loads `dotenv` first, so it encrypted with the real `.env` keys.
- **Effects:**
  - `GET /admin/caregivers` and `GET /caregiver/profile` return the CNIC as ciphertext, or as a masked version of the ciphertext.
  - `GET /customer/patients` and `GET /caregiver/visits/:id` return `medicalContext` as raw `iv:tag:data`.
  - `GET /caregiver/payout-accounts` returns **500** for seeded caregivers, because `decryptField` throws.
- **Needed:**
  - Load the env before any module is imported: `import 'dotenv/config'` (pointing at the root `.env`) as the first line of `main.ts`, or derive keys lazily from `ConfigService`. Then re-seed.
  - `decryptMaybe` should return `null` or a flag on failure instead of the ciphertext.
  - `presentAccount` must not fail the whole list.
- **Frontend today:**
  - Ciphertext-looking values are never shown. CNIC shows "—" or "Unavailable".
  - Medical context shows "couldn't be loaded / ask the family" and is never saved back.
  - The payout accounts card shows an error state with retry.

### 2. Card, JazzCash and Easypaisa payments can't be completed, and they block cash
- **Problem:** `POST /customer/payments` (`payments/payments.module.ts` → `initiate`) creates a PENDING payment with `gatewayRef = "gw_<id>"` and no checkout or redirect URL. Only the webhook can settle it. That PENDING row then makes every later attempt fail with "A payment for this visit is already in progress", including cash, so the visit can never be paid.
- **Needed:**
  - Return `{ payment, checkoutUrl }` (hosted checkout) for gateway methods.
  - Let a PENDING gateway payment be abandoned: `PATCH /customer/payments/:id/cancel` → FAILED, or expire it after N minutes.
- **Frontend today:**
  - The pay dialog offers **cash only**; card and wallets show "Coming soon".
  - Existing PENDING digital payments show "Awaiting confirmation".

### 3. The customer chooses the payment amount
- **Problem:** `InitiatePaymentDto.amount` is optional but accepted from the customer (`@Min(0)`), so any amount can be "paid".
- **Needed:** remove `amount` from the customer DTO. Always charge `rateSnapshot − discountAmount` on the server.
- **Frontend today:** never sends `amount`.

### 4. The caregiver can't confirm cash, because no route gives them the payment ID
- **Problem:** `POST /caregiver/payments/:id/confirm-cash` needs a payment ID. `visitInclude()` in `visits/visits.module.ts` has no `payments`, no caregiver route returns payments, and no notification carries the ID.
- **Needed:** in the caregiver visit detail, include
  `payments: { select: { id, method, status, amount, caregiverAmount, paidAt }, orderBy: { createdAt: 'desc' } }`.
- **Frontend today:** the "Confirm cash received" card is built and typed for exactly that field (`CaregiverVisitDetail.payments`). It stays hidden until the field appears; no frontend change is needed afterwards.

### 5. Customer-only routes have no role guard
- **Problem:** `customer/patients`, `customer/addresses` and `customer/emergency-contacts` have no `@Roles(UserRole.CUSTOMER)`. A caregiver or admin token can read and create patients and addresses; a caregiver token gets `200 []` on `GET /customer/patients`.
- **Needed:** add `@Roles(UserRole.CUSTOMER)` to PatientsController, AddressesController and the emergency-contact routes. `/customer/me` can stay open to all roles, since every app uses it.
- **Frontend today:** every app checks the role after login and in its shell, and signs out a mismatched role.

### 6. Logging in on any app creates a customer account
- **Problem:** `POST /auth/otp/verify` (`auth/auth.service.ts`) creates a CUSTOMER for any unknown phone. An OTP attempt on the admin login therefore creates a customer and returns valid customer tokens.
- **Needed:** an optional `audience`/`role` on `VerifyOtpDto` (or separate admin/caregiver verify routes). It should refuse to create users, or issue tokens, for a mismatched audience.
- **Frontend today:** the admin and caregiver apps reject the wrong role, revoke the refresh token (`/auth/logout`) and show a clear message.

### 7. A booking is never marked COMPLETED
- **Problem:** nothing in `bookings/bookings.module.ts` or `visits/visits.module.ts` sets `BookingStatus.COMPLETED`; only seed data has it.
- **Needed:** when a visit becomes COMPLETED and none of the booking's visits are still open (REQUESTED, CONFIRMED, EN_ROUTE, CHECKED_IN, IN_PROGRESS, CHECKED_OUT), set the booking to COMPLETED.
- **Frontend today:** a CONFIRMED booking whose remaining visits are all completed is shown as "Completed" and listed under Past.

---

## P1: features incomplete or wrong

### 8. `reactivate` doesn't lift a suspension
- **Problem:** `VerificationService.reactivate` only sets `user.status = ACTIVE`. `verificationStatus` stays SUSPENDED, so the caregiver stays hidden from search. That contradicts the route description.
- **Needed:** if `verificationStatus === SUSPENDED`, set it to APPROVED, keep `approvedAt` and `reverifyDueAt`, and write an audit entry.
- **Frontend today:** calls reactivate, then approve. That resets `approvedAt` and the 365-day re-verification date, and the dialog warns about it.
- **Once fixed:** remove the fallback in `src/features/admin/components/caregivers/caregiver-drawer.tsx`.

### 9. No route to deactivate a caregiver (FR-A3)
- **Problem:** `VerificationService.deactivate` exists, but no controller route exposes it.
- **Needed:** `POST /admin/caregivers/:id/deactivate` with a `DecisionDto` body.
- **Frontend today:** the action only appears in mock mode.
- **Once added:** set `CAN_DEACTIVATE_CAREGIVER` in `src/features/admin/lib/api/admin.ts` to `true`.

### 10. Visit and booking responses don't name the caregiver
- **Problem:**
  - `GET /customer/visits/:id` has no caregiver.
  - `GET /customer/bookings/:id` has only `caregiver: { id, specialty, userId }`.

  The family needs the caregiver's name and licence to check ID at the door.
- **Needed:** include `caregiver: { id, licenseNumber, licenseBody, specialty, ratingAverage, ratingCount, user: { fullName } }` in both.
- **Frontend today:**
  - Loads `GET /caregivers/:id` separately.
  - That route returns 404 once a caregiver is suspended; the UI then says the details aren't available.

### 11. No caregiver photo in public profiles; storage URLs don't load in dev
- **Problems:**
  - `GET /caregivers` and `GET /caregivers/:id` return no photo URL.
  - Cloudinary isn't configured, so every presigned URL is `https://storage.local/...` and can't load. This affects document, prescription and photo URLs.
  - The in-memory fallback is lost on restart.
- **Needed:**
  - A short-lived `photoUrl` in both public responses, and optionally in `GET /caregiver/profile`.
  - Real presigned storage (Cloudinary, S3 or MinIO), or a dev stub that serves files.
  - `POST /caregiver/photo` should accept images only; it currently also allows PDF.
- **Frontend today:**
  - Initials avatars everywhere.
  - The in-app file viewer shows its error state.
  - Files are never opened in a new tab.

### 12. Payout notes and rejection reasons aren't stored
- **Problem:** `ResolvePayoutDto.note` is dropped. `reason` only goes into AuditLog metadata. So the caregiver never sees why a payout was rejected, or the transfer reference.
- **Needed:** add `PayoutRequest.note` and `PayoutRequest.rejectionReason` (or `resolutionNote`), save them in `PayoutsService.resolve`, and return them from the admin and caregiver lists.
- **Frontend today:** the admin dialogs say the note isn't saved yet.

### 13. Update routes return bare rows
- **Problem:** these routes return the bare row, without the relations their list views have:
  - `PATCH /admin/safety-incidents/:id`
  - `PATCH /admin/disputes/:id/resolve`
  - `POST /admin/payouts/:id/*`
  - `POST /admin/caregivers/:id/*` returns no `user`, and the CNIC isn't decrypted
- **Needed:** return the same `include`/presentation as the list endpoints.
- **Frontend today:** merges the response into the row it already has.

### 14. Check-in and check-out problems
- **Problems:**
  - There's no geofence: GPS check-in and check-out never compare the coordinates with `booking.address`.
  - OTP check-out is never verified: `method: "OTP"` with no code passes.
  - The check-in OTP is consumed *before* the status is checked. A code issued while the visit is CONFIRMED is used up, then check-in fails with "Cannot move visit from CONFIRMED to CHECKED_IN".
- **Needed:**
  - Distance validation with a configurable radius, returning 400 with a clear message.
  - Require a code for OTP check-out, or rename the method to MANUAL.
  - Check that the visit is EN_ROUTE before consuming the OTP.
- **Frontend today:** the OTP option is only offered while the visit is EN_ROUTE.

### 15. `GET /caregiver/visits?date=` is ignored
- **Problem:** the filter is validated but never applied. Lists sort by `scheduledDate asc` with a maximum of 100, so a busy caregiver's today and upcoming visits drop off the first page.
- **Needed:** apply `date`, and ideally add `from`, `to` and `sort`.
- **Frontend today:** fetches 100 and filters in the browser.

### 16. Registering as a caregiver converts the customer account
- **Problem:** `POST /caregiver/register` sets `user.role = CAREGIVER`, so an existing family account loses every customer route.
- **Needed:**
  - A product decision on dual-role users.
  - "Profile already exists" should return 409, not 404.
  - Optionally, return a fresh token pair from register.
- **Frontend today:** refreshes the token right after register; the refresh re-reads the role, which works.

### 17. Notifications have no read state and some events are missing
- **Problems:**
  - No `readAt` and no mark-read route.
  - There's one row per channel and no channel filter.
  - The caregiver gets no notification when verification is approved or rejected, when a payout changes, or when a customer starts a cash payment.
- **Needed:**
  - `Notification.readAt` and `POST /notifications/read` taking `{ ids? | before? }`.
  - A `?channel=PUSH` filter.
  - The missing events.
- **Frontend today:** keeps a per-device "seen" timestamp and shows PUSH rows only.

### 18. No promo check before booking
- **Problems:**
  - An invalid code is only reported when `POST /customer/bookings` fails, so the review step can't show the discounted price.
  - There's no per-customer limit, and one booking redeems the code once while the discount applies to every visit.
- **Needed:** `GET /promos/quote?code=&caregiverId=` returning `{ code, discountAmount, perVisitAfterDiscount }`.
- **Frontend today:** shows the booking error, translated, under the promo field.

### 19. SOS coordinates are thrown away
- **Problem:** `SosDto.latitude` and `longitude` are accepted (`@IsOptional()` only), but `raiseSos` never stores or forwards them.
- **Needed:** validate them (`@IsNumberString()` or numbers), save them on the incident or event, and put a maps link in the admin alert.
- **Frontend today:** sends the location when available, as strings to match the DTO. The alert never waits for it.

---

## P2: validation, status codes, polish

20. **Promos** (`promos/`):
    - Create checks for duplicates *before* upper-casing, so `welcome10` against an existing `WELCOME10` returns a 500 instead of a conflict.
    - Nothing checks PERCENT ≤ 100 or `validTo > validFrom`.
    - `maxUses` can't be cleared back to unlimited; allow `null`.
21. **Config** (`config/platform-config.module.ts`):
    - An unknown key or invalid value on `PUT /admin/config/:key` throws a plain `Error`, giving a 500. It should be 404 or 400.
    - Add `DELETE /admin/config/:key` to return to the default.
22. **CSV export:**
    - CORS doesn't expose `Content-Disposition`; use `app.enableCors({ exposedHeaders: ['Content-Disposition'] })`.
    - In the caregivers report the rating comes out as `"""0"""`, because the Prisma `Decimal` goes through `JSON.stringify`.
    - The payouts and bookings exports contain IDs only, with no names.
23. **Availability:**
    - `SetAvailabilityDto.rules` lacks `@ValidateNested()` and `@Type(() => AvailabilityRuleDto)`, so rule fields aren't validated.
    - A duplicate `(dayOfWeek, startTime)` gives a 500.
    - Invalid windows return 404 instead of 400.
    - A block ending "today" disappears at 05:00 PKT, because of the UTC midnight comparison.
24. **Wrong status codes:**
    - Deleting a patient or address that a booking uses returns 404; it should be 409.
    - `CreatePayoutRequestDto.payoutAccountId` and `CaregiverReportIncidentDto.visitId` use `@IsString`; use `@IsUUID()` so bad IDs give 400, not a Prisma 500.
25. **Patients:** `dateOfBirth` and `gender` can't be cleared; allow `null`.
26. **Emergency contacts:** `phone` has no format validation; use the same Pakistani mobile regex as auth.
27. **Re-verification:**
    - The seed sets `approvedAt` but not `reverifyDueAt`, so the admin re-verification page is empty.
    - Add a `reverifyDueBefore` filter or a sort to `GET /admin/caregivers`.
28. **Analytics** (`admin/analytics.module.ts`): some figures filter on the wrong date:
    - `paidOut` uses `requestedAt`; it should use `processedAt`.
    - Completed visits use `createdAt`.
    - Gross revenue uses `createdAt`; it should use `paidAt`.
29. **Spec/contract mismatches:**
    - `POST /auth/otp/verify` returns only `{ accessToken, refreshToken }`, though the spec example shows a `user` object.
    - `CreateBookingDto.weekdays` is documented as a string array, but the API requires **integers 1–7**; strings get a 400.
30. **Small additions that would simplify the UI:**
    - `?visitId=` on `GET /customer/payments`.
    - Visit info on `GET /disputes`.
    - `lastLoginAt` isn't set for seeded users.
    - A fixed message for "Cannot move a payout from X to Y", so it can be translated.

---

## How the frontend runs against this backend

- Create `frontend/.env.local` (already done locally) with:
  - `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`
  - `NEXT_PUBLIC_USE_MOCKS=false`

  Set `NEXT_PUBLIC_USE_MOCKS=true` to go back to mock data.
- **Auth:**
  - Access tokens last 15 minutes. The client refreshes on a 401 (single flight, safe across tabs) and retries the request.
  - If the refresh fails, the session is cleared and the user is sent to that section's login.
- **OTP in development:** the code is printed in the **backend console**. Login pages show this hint and the seeded demo numbers in non-production builds.
- **Errors:** backend messages are translated into Urdu where they're known (`src/shared/i18n/messages/*/apiErrors.json`). Anything else is shown as sent.
