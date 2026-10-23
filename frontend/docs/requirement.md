# Backend requirements from the frontend wiring

Wiring the frontend to the backend (`frontend/` against `backend/`, API v1), 22–23 October 2026.

The frontend now calls every route in the OpenAPI spec (78 paths) through its API layer (`src/features/*/lib/api/*.ts`). The one exception is `POST /payments/webhook/{provider}`, which only the payment gateway calls. Each request and response type was checked against the backend source (controller → service → Prisma `select`/`include`). The read routes were also called on the local backend to compare real responses.

## Live flow verification (23 October 2026)

A full production-shaped journey was run through the frontend's own API functions against the running backend (`src/e2e/full-flow.e2e.ts`, `npm run test:e2e`). It creates fresh test users (seeded demo data untouched) and exercises all three roles end to end. **42 of 43 steps passed**; the one miss is the cache issue in item 31 below (now polled around in the test).

Confirmed working end to end against the real backend:

- **Admin:** health, analytics, commissions (read + update), caregiver verification queue, document presigned URL, approve; payout queue → approve → mark-paid; safety-incident triage + status update; dispute queue + resolve.
- **Customer:** profile read/update, patient create + single-record read (medical context **decrypts correctly** for data written by this backend), address create, emergency contact; public caregiver profile; booking (SINGLE) create, prescription upload; visit tracking; review; cash payment initiate; payment receipt; safety report; dispute raise + list.
- **Caregiver:** register (role upgrade handled), document upload, availability set, profile status; booking queue, accept; visit lifecycle en-route → check-in (GPS) → check-out → note → COMPLETED; confirm cash → PAID; earnings (available balance after paid cash); payout account + payout request.
- **Money math checks out:** a Rs 600 cash visit at 20% commission produced the caregiver's available balance, which flowed through a payout request to admin settlement.

Not covered (needs real providers, as agreed): the JazzCash / Easypaisa / Card webhook settlement path (`POST /payments/webhook/{provider}`) — see item 2.

Note: the encryption-key mismatch in item 1 only affects **data written by the seed script** (it used different keys). Records created through the running API encrypt and decrypt correctly, which the live run confirmed for patient medical context. Fixing item 1 still matters so the seeded demo data is readable.

## Update — resolved by dev (pulls up to `82f487c`, 23 October 2026)

Two dev pulls landed the backend side of most items below:

- **Phase 14 — `12e7e10` (31 fixes "from frontend wiring requirements"):** root `.env` loaded before key derivation and undecryptable fields now return null (**item 1**); payments charge server-side only and gateway methods return `{ payment, checkoutUrl }` with cancel/expire of PENDING rows, and the caregiver sees payments on visit detail (**items 2, 3, 4**); role guards on patients/addresses/availability/emergency-contacts (**item 5**); OTP verify takes an audience and ADMIN never creates accounts (**item 6**); a booking flips to COMPLETED when its last open visit completes (**item 7**); Cloudinary public delivery URLs, PDFs as raw, image-only photos, `photoUrl` on caregiver responses (**item 11**); reactivate lifts suspension + deactivate route + search-cache invalidation + caregiver named on booking/visit (**items 8, 9, 10**); payout note/rejection stored, admin updates return list rows (**items 12, 13**); GPS geofence, OTP check-out verified, OTP kept until valid (**item 14**); caregiver visits date/from/to/sort filters (**item 15**); register returns 409 + fresh tokens (**item 16**); notification read-state, channel filter, new caregiver events (**item 17**); `GET /promos/quote`, one use per customer (**item 18**); SOS coordinates stored + linked in the admin alert (**item 19**); plus the P2 validation/status-code fixes.
- **Payments — `6b8599e` + `8dfb610`:** Stripe Checkout for card payments with verified webhook signatures. `POST /customer/payments` now returns the bare payment for **CASH** and `{ payment, checkoutUrl }` for **CARD** (Stripe) / JazzCash / Easypaisa.
- **Storage — `67b17f4` + `82f487c`:** PDF/image viewing works against real Cloudinary, and every uploaded-document response now carries a viewable `url`.

**Frontend wiring done in response (this branch):** the customer payment dialog now enables **Card** alongside Cash; a gateway method's `{ payment, checkoutUrl }` redirects the browser to the hosted checkout (`window.location.assign`), settling via the Stripe webhook. JazzCash/Easypaisa stay "coming soon" until their gateway lands. (`paymentsApi.initiate` return type is now `InitiatePaymentResult`.) Everything else below was already wired to expect these fixes (see each "Frontend today"), so no further frontend change was required; document viewing and the caregiver cash-confirm card light up automatically now that the backend returns the data. **Card payments require the backend's `STRIPE_*` env (see `.env.example`); without it the gateway URL is a placeholder.**

---

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

### 5. Customer-only routes have no role guard (partially fixed)
- **Problem:** `CustomerPaymentsController` now carries `@Roles(UserRole.CUSTOMER)` (fixed), but `customer/patients`, `customer/addresses` and the emergency-contact routes on `UsersController` **still have none**. Re-verified live (23 Oct 2026): a **CAREGIVER** token gets `200 []` on both `GET /customer/patients` and `GET /customer/addresses`.
- **Needed:** add `@Roles(UserRole.CUSTOMER)` to `PatientsController` (`patients/patients.module.ts`), `AddressesController` (`addresses/addresses.module.ts`) and the emergency-contact routes (`users/users.module.ts`). Keep `/customer/me` open to all roles, since every app uses it for role detection.
- **Frontend today:** each app checks the role after login and in its shell, and the new `/login` routes strictly by the token's role — but a caregiver/admin token can still read a customer's patients/addresses directly at the API until the guards are added.
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

### 11. Cloudinary storage: uploads work, but file VIEWING is broken (P0)
Live end-to-end test, 23 Oct 2026, against the running backend with Cloudinary configured in the root `.env` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`). Startup logs `Storage: Cloudinary (descwlwga)`, so the config is picked up.

- **Upload — WORKS ✅ (images):** `POST /caregiver/photo` and `POST /caregiver/documents` with a PNG both succeed and the asset lands in Cloudinary. Confirmed via the Cloudinary Admin API: `resource_type: "image", type: "upload", format: "png"`.
- **Viewing — BROKEN ❌ (all roles):** `GET /caregiver/photo/url` (and `/caregiver/documents/:id/url`, and the admin/customer equivalents, all of which call `StorageService.presignedGet`) returns a URL that **fails with `{"error":{"message":"General Error"}}`**. Root cause in `backend/src/common/storage/*.ts`:
  ```ts
  return cloudinary.utils.private_download_url(fileKey, 'auto', { resource_type: 'auto', expires_at });
  ```
  The assets are uploaded as **public `type: 'upload'`**, so the *private-download* API is the wrong API for them; and `'auto'` is passed as the **format** (2nd positional arg) and as `resource_type`, both invalid. Cloudinary's own canonical delivery URL for the stored asset is simply `https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<fileKey>`.
  - **Fix:** for public uploads, return the plain secure delivery URL — `cloudinary.url(fileKey, { resource_type, secure: true })` (derive `resource_type` as `image` for images, `raw` for PDFs; store it alongside `fileKey` so viewing knows which). Drop `private_download_url`/`expires_at` entirely unless you switch uploads to `type: 'authenticated'` (then sign the delivery URL with the correct format + resource_type, not `'auto'`). Until this changes, **no uploaded file can be viewed in any panel.**
- **PDF upload — FAILS ⚠️:** `POST /caregiver/documents` with `application/pdf` returns **500** (image uploads to the same route succeed). CNIC/licence docs are typically PDFs. Likely the `resource_type: 'auto'` path for PDFs and/or the account's "PDF and ZIP files delivery" restriction. Decide `resource_type: 'raw'` (or `'image'`) explicitly for PDFs and enable PDF delivery on the Cloudinary account; confirm with a real PDF.
- **Still open (unchanged):**
  - `GET /caregivers` and `GET /caregivers/:id` return **no photo URL** — a customer never sees the caregiver's photo before the visit (SRS §9.2). Add a `photoUrl` (built the same corrected way) to both public responses, and optionally to `GET /caregiver/profile`.
  - `POST /caregiver/photo` should accept images only; it currently also allows PDF (`validateUpload` permits `application/pdf`).
- **Frontend today:** uploads go through fine; the in-app `FileViewer` shows its error state because the `{url}` it's handed 500s. This cannot be fixed on the frontend — the backend must return a valid delivery URL. No file is opened in a new tab.

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
- **Partially fixed (23 Oct 2026):** `GET /disputes` now returns `resolutionNote` and the visit, and the UI shows them; the bare-row responses on the admin update routes above are still the issue.

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
    - Deleting a payout account that has payout history returns a **500** (FK constraint) instead of **409**; `PayoutAccountsService.remove` (`payouts/payouts.module.ts`) should catch the constraint and return a clear 409. (The frontend already maps status 500 here to a "remove blocked" message.)
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
31. **Public caregiver search cache isn't invalidated** (`caregivers/caregivers.module.ts`, found in the live run).
    - `GET /caregivers` caches each `(specialty, city, page, limit)` page in Redis for `search.cacheTtlSeconds` (default 30s). `VerificationService.approve`, `suspend`, `reactivate` and `reject` (`verification/verification.module.ts`) never clear it.
    - Effect: a newly **approved** caregiver stays absent from search, and a **suspended** one stays visible, for up to 30s. Booking still re-checks APPROVED server-side, so this is a visibility/staleness issue, not a security hole.
    - Suggested change: on any verification-status change, delete the `search:caregivers:*` keys (`redis.keys` + `del`, or keep a key set), or drop the cache for that specialty/city.
    - Frontend today: the live-flow test polls the search for up to 35s; the UI just shows whatever search returns.

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
