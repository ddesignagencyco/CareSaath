# Backend requirements (open) & Phase 15 frontend adoption (complete)

The **Phase 15** dev pull is **fully adopted** in `frontend/` — every item below is ✅, with `tsc`, `eslint` and the test suite green. What's still open is the list of **backend** items the frontend is waiting on (bottom of this file). Nothing outside `frontend/` is changed from here (except the new `socket.io-client` client dependency in `frontend/package.json`); backend paths are relative to `backend/src/` (seed under `backend/prisma/`).

## Deployment / config (Phase 15)

- Backend `npm install` (new deps `socket.io`, `@socket.io/redis-adapter`, `pdfkit`) and run migrations `20261026100000_notification_audience`, `20261026110000_cash_verification`, `20261026120000_payout_two_sided`, `20261026120100_payout_backfill` (existing rows are backfilled).
- `REDIS_URL` set (socket events fan out via Redis across instances); the load balancer must allow **WebSocket upgrades** (or sticky sessions if long-polling is on).
- Platform settings (`PUT /admin/config/:key`): `visit.requirePaymentBeforeComplete` (default `1`).

## Backend code (still open)

1. **P1 — Partial payout request forfeits the locked remainder (money integrity).**
   `PayoutsService.createPayoutRequest` (`payouts/payouts.module.ts`) greedily attaches **whole** PAID payments until `running >= amount`, so the last payment overshoots, but `payoutRequest.amount` records only the smaller figure, and the overshoot is never returned to `available`. Example: two Rs 400 PAID visits (available Rs 800), request Rs 500 → both locked → settled at Rs 500 → **Rs 300 lost**. **Needed:** split the overshooting payment or credit the remainder back on settlement; or constrain requests to whole-payment boundaries. (Re-verify against the Phase 15 two-sided payout rework.) FE mitigation: restrict withdrawal to the full available balance or warn that partial amounts consume whole visits.

2. **P2 — Booking ignores caregiver availability (weekly hours AND blackout blocks).**
   `createCustomerBooking` (`bookings/bookings.module.ts`) never checks the caregiver's `AvailabilityRule`s or `AvailabilityBlock`s, so a customer can book outside hours or on a blackout day. The FE off-hours warning only compares weekly `availabilityRules` (blocks aren't exposed on the public caregiver response). **Needed:** validate occurrences against rules **and** blocks on booking (reject or require override); and/or expose `AvailabilityBlock`s on `GET /caregivers/:id`.

3. **P2 — Admin safety queue can bury a newer CRITICAL incident on a later page.**
   `GET /admin/safety-incidents` (`admin/safety.module.ts`) lists oldest-first and the UI sorts by priority only within the fetched page, so with >20 open incidents a fresh CRITICAL/SOS lands on page 2. **Needed:** order by priority rank, then createdAt, server-side.

4. **Seed cleanup deletes in the wrong FK order** (`prisma/seed.mjs`).
   Re-seeding a non-empty DB fails with `VisitNote_visitId_fkey`: cleanup deletes `VisitNote` only `where caregiverId in <seed caregivers>`, leaving notes that reference the visits it then deletes. Delete `VisitNote` scoped by visit → booking → customer, or before the visit delete. Workaround: `prisma migrate reset` then seed.

5. **Public caregiver API exposes the license number (privacy).**
   `GET /caregivers/:id` and the visit's caregiver payload include `licenseNumber`. The frontend no longer displays it (customers now see only "License verified by CareSaath · <council>", no number, and never a CNIC), but the raw number is still in the JSON. **Needed:** drop `licenseNumber` (and any CNIC / document numbers) from **customer-facing** caregiver responses — expose only `verified: boolean` + `licenseBody` (council). Keep the number on admin/verification endpoints only.

6b. **Privacy — don't expose the counterparty's phone across the customer↔caregiver boundary.** Product decision: neither side should see the other's number. The FE now hides it (removed the caregiver's "Call family" tel link + the customer phone on the caregiver visit page; emergency-contacts is removed from the customer UI), and the two parties contact each other via in-app chat/call instead. **But the number is still in the payloads** (`GET /caregiver/visits/:id` returns `booking.customer.phone`). **Needed:** strip the counterparty's `phone` from cross-party responses (keep it only where the backend itself needs it — e.g. SOS alerting is server-side). Also confirm the customer's visit/booking payloads never include the caregiver's phone.

6. **Service area is city-level only — too coarse for large cities.**
   `serviceArea.cities` (e.g. "Lahore") can't tell a customer whether a caregiver covers *their* area/sector of a big city, and booking/search don't match on it — so a Lahore customer can't see which part of Lahore a caregiver serves. **Needed:** model sub-city coverage (areas / zones / sectors, a radius around points, or polygons) on the caregiver; expose it on `GET /caregivers/:id`; filter search and validate booking against the customer address's area, not just its city. (Pairs with the availability-on-booking gap — item 2.)

7. **Who funds the promo discount? — currently the caregiver (and platform), not the admin. Confirm this is intended.**
   `createPayment` (`payments/payments.module.ts`): `amount = rateSnapshot − discountAmount`, then `splitCommission(amount, pct)` → `commission = round(amount × pct%)`, `caregiver = amount − commission`. The discount is removed from the price **before** the split, so the promo is absorbed by the caregiver and the platform in proportion to the commission — the admin never separately funds it. Example: rate Rs 600, `WELCOME10` (−Rs 60) → amount Rs 540; at 15% commission → platform Rs 81, caregiver Rs 459 (vs Rs 90 / Rs 510 with no promo) → **caregiver −Rs 51, platform −Rs 9**. **Decision needed:** if promo codes are platform marketing, the platform should absorb them (pay the caregiver on the full rate; take commission on the full or net rate) instead of docking the caregiver's payout. Otherwise make it explicit (FE + caregiver terms) that promo codes reduce caregiver earnings.

8. **Expose the visit note on `booking.visits` (so a past booking can show/preview it).**
   `GET /customer/bookings/:id` returns base `Visit` rows without the note, so the booking page can't tell which visits have a caregiver note. The FE now shows a "Visit note" link on COMPLETED visits (which always carry a note) that taps through to the visit page. **Needed:** include `hasNote` (or the note `summary` + `submittedAt`) on each visit in the booking response so the list can flag/preview it accurately rather than inferring from status.

## Real-time visit tracking

The customer's visit screen shows live progress — **Confirmed → On the way → Arrived → Care → Done** — and the "Track the visit live" prompt while the caregiver is en route.

1. **Status steps (live) — ✅ delivered (Phase 15).** Each step is a visit status transition (`CONFIRMED` → `EN_ROUTE` → `CHECKED_IN` → `IN_PROGRESS` → `CHECKED_OUT`/`COMPLETED`). When the caregiver advances a visit, the backend emits Socket.IO `entity.updated { type: "visit", id, status }`; the customer's on-screen visit timeline refetches instantly (no reload), and a per-step PUSH notification is sent. No further backend work needed for the status steps.

2. **Live location tracking — OPEN (new backend requirement).** The "Caregiver on the way · Track the visit live" step implies a live map of the caregiver's position en route; this is **not implemented**. Needed process:
   - **Caregiver streams location** while a visit is `EN_ROUTE`: the caregiver app sends periodic GPS fixes (~every 10–15 s) via `POST /caregiver/visits/:id/location { lat, lng, at }` (or over the socket). Accept only from the assigned caregiver and only while the visit is `EN_ROUTE`.
   - **Backend relays to the customer** scoped to that visit: emit Socket.IO `visit.location { visitId, lat, lng, at }` to the visit's customer only (room `visit:<id>` / `user:<customerId>`); optionally compute and include an **ETA** to the address.
   - **Last-known position** cached in Redis (short TTL) so a reconnecting customer gets the latest fix immediately; stop the stream and clear it at `CHECKED_IN`.
   - **Privacy / retention:** keep location only for the active `EN_ROUTE` window — never persist long-term; purge on check-in / visit end (tie into the retention service).
   - FE follow-up (after the backend lands): a map on the visit page subscribing to `visit.location` to draw the caregiver's position + ETA. Today the step only shows the "Track the visit live" text, no map.

## In-app messaging (new feature — requested, backend-heavy)

A WhatsApp-style 1:1 chat between a customer and their assigned caregiver: text, **media sharing** (images/files/voice), **reply-to-message**, **emoji + reactions**, read receipts, typing indicators. This is a substantial backend feature; the FE chat UI can only be built once the API + realtime exist. Recommend phasing.

**Status (28 Oct 2026 — regression-backend landed a minimal version, FE wired):**
- ✅ **Delivered & wired:** booking-scoped **text** chat (`GET/POST /bookings/:bookingId/messages`, `PATCH …/read`) with realtime `entity.updated{type:'chat_message'}`; and **WebRTC call signaling** (`call:invite|answer|ice-candidate|end|reject` → `call:incoming|answered|ice-candidate|ended|rejected` + a `CallLog`). The FE now uses the real text chat (keyed by bookingId, read-on-open, live) and a real `RTCPeerConnection` call engine.
- ❌ **Still needed for the shipped rich UI** (kept as mock/demo in the FE until the backend catches up — they work locally but don't cross devices):
  - **Media / voice / reactions / replies persistence** — backend `ChatMessage` is text-only (`body`). Needs the `type/mediaKey/replyToId` + `MessageReaction` model + the resumable media upload below.
  - **Per-message read** — backend has only bulk `markRead`; fine for text ticks, but no per-message granularity.
  - **Customer-initiated calls (blocker)** — `call:invite` requires the **callee's user id**. The caregiver has it (`booking.customerId`) so **caregiver → family calls work**; the **customer cannot obtain the caregiver's user id** from any public shape, so **customer → caregiver calls can't be initiated** (the customer can still *receive* them). Fix: expose the caregiver's `userId` on the customer's booking/visit payload, **or** add a visit-scoped invite (`POST /calls` taking `visitId`, deriving the callee) so neither side needs the other's user id.
  - **STUN/TURN** — the FE uses a public STUN only; production NAT traversal needs a TURN server.

**Data model (backend):**
- `Conversation` — the two participants (customerId, caregiverId), optional `bookingId`, `lastMessageAt`, archived flag.
- `Message` — `conversationId`, `senderId`, `type` (`TEXT|IMAGE|FILE|VOICE`), `body`, `mediaKey`, `replyToId`, `createdAt`, `editedAt`, `deletedAt`.
- `MessageReaction` — `messageId`, `userId`, `emoji`.
- Read state — per-participant `readAt`/last-read message (for unread counts + ticks).

**Endpoints:** `GET /conversations` (list w/ last message + unread), `GET /conversations/:id/messages` (paginated), `POST /conversations/:id/messages` (text or media — reuse the upload pipeline for `mediaKey`), `POST …/messages/:id/react`, `POST …/read`, signed-URL fetch for media.

**Realtime (reuse the Phase 15 Socket.IO):** emit `message.created`, `message.read`, `message.reaction`, `typing` to the conversation's participants only (room `conversation:<id>`).

**Access control & lifecycle:** only the customer and their assigned caregiver may open/read/post; enforce on every endpoint **and** socket room. A conversation opens when a booking is `CONFIRMED` and is archived (read-only) after completion. Include block/report + media retention/moderation hooks.

**Notifications:** unread message count + a push notification (reuse the notifications system) when the recipient isn't in the chat.

**Media uploads:** photos / videos / voice notes should use **resumable, pausable** chunked uploads (e.g. tus, or a multipart upload session with progress), so the FE can show real upload progress and let the user pause/resume large files. The FE today sends media as local data URLs and only *simulates* upload progress; true pause/resume needs this backend.

**Voice & video calls:** the chat header has voice + video call buttons; real calling needs a **WebRTC** signalling backend (STUN/TURN servers, call offer/answer + ICE over the socket, ringing / accept / decline, and call-log records). The FE currently shows a *simulated* call screen.

**Phasing suggestion:** P1 — text + images + read receipts + realtime; P2 — reply + reactions/emoji; P3 — voice notes + typing indicators.

**Frontend (after the API lands):** a chat screen (message list, composer with attach + emoji picker, reply preview, reactions, read ticks) reachable from the booking/visit pages and a new "Messages" nav item; realtime via the existing `useRealtime` socket; media via the existing `FileViewer`.

## Pre-production QA — backend gaps (2026-10-29)

From a full senior-QA audit of all three apps. Frontend-fixable items are being built directly; the items below **need backend work** (frontend will wire them once they exist). Chat media/reactions/replies, customer call-initiation, and STUN/TURN are already covered in *In-app messaging* above.

**P1**
- **Notification preferences** — `NotificationChannel` has SMS/WHATSAPP/PUSH/EMAIL and all enabled adapters fire unconditionally. There is **no `NotificationPreference` model or endpoint**, so users can't opt out of a channel. Required before any WhatsApp/marketing sends. (Then FE adds a prefs screen.)
- **Caregiver strikes visibility** — `CaregiverProfile.strikeCount` is returned (FE now shows it), but there is **no caregiver-facing endpoint listing individual strikes** (reason/date). Needed so a caregiver understands why they were struck/suspended.
- **Admin: strike handling** — `reactivate` lifts SUSPENDED→APPROVED but **does not reset `strikeCount`**, so the next strike re-suspends immediately (loop). Add a strike-reset on reactivate (or a clear-strikes action), plus `GET /admin/caregivers/:id/strikes` for history.
- **Admin: bookings/visits browser** — no `admin/*` booking or visit endpoints, so operators can't look up a booking/visit, see ASAP bookings, visit timelines, GPS check-in/out, or cancellations.

**P2**
- **Change phone number** — phone is the login identity; no change/verify-new-number endpoint (needs an OTP re-verify flow). No UI possible until it exists.
- **Account deactivation / deletion (self-service)** — `UserStatus.DEACTIVATED` exists but there's no self endpoint for customer or caregiver (privacy / right-to-erasure).
- **Credential documents** — no `DELETE /caregiver/documents/:id`; a caregiver who uploads the wrong file can't remove/replace it.
- **Admin: CallLog audit** — `CallLog` exists but has no admin endpoint/UI (call history for safety-incident investigation).
- **Admin: payments** — `GET /admin/payments/:id/receipt` exists but is unwired and there's **no list-payments endpoint** / per-visit commission view for operators.
- **Admin: MedicalOrder view** — only reachable via caregiver/customer visit controllers; admins can't view a visit's medical orders during a dispute.
- **Admin: users/customers management** — no way to search a customer, view their bookings, or deactivate an account.
- **Disputes mediation** — resolve-with-note only; no priority, assignment, or refund/compensation linkage.
- **Hard "stop location sharing"** — a server endpoint that clears `currentLat/Lng` so a caregiver can truly turn live-location off (FE adds a consent toggle regardless).

**Admin console (needs backend)**
- **Strike handling (P0)** — `reactivate` lifts SUSPENDED→APPROVED but does NOT reset `strikeCount`, so the next strike re-suspends immediately (loop). Add a strike reset/clear on reactivate, plus `GET /admin/caregivers/:id/strikes` for history. (FE now shows the `strikeCount` scalar in the drawer.)
- **Caregiver badge in the admin payload** — `badge` is computed only on the caregiver's own `GET /caregiver/profile`; the admin list returns raw columns, so the drawer can't show the tier until the admin list/detail computes `badge` too.
- **Bookings/visits browser** — no `admin/*` booking or visit endpoints; operators can't look up a booking/visit, ASAP bookings, timelines, GPS check-in/out, or cancellations.
- **CallLog audit** — exists but no admin endpoint/UI (call history for safety investigations).
- **Payments** — `GET /admin/payments/:id/receipt` exists but is unwired; there's no list-payments / per-visit commission endpoint for operators.
- **MedicalOrder view** — admins can't view a visit's medical orders during a dispute.
- **Users/customers management** — no way to search a customer, view their bookings, or deactivate an account.
- **Disputes mediation** — resolve-with-note only; no priority, assignment, or refund/compensation linkage.

## Authentication & sign-up (needs backend — important)

**Problem (found in QA):** OTP verify is a single *find-or-create by phone*, so **login and sign-up are the same call**. Signing **up** with a number that already exists silently signs you **into that existing account** (e.g. a seeded user), and logging in with a brand-new number silently **creates** an account. That conflation is a correctness/security problem. The frontend now guards it heuristically (sign-up rejects a number whose account already has a name, and routes them to log in), but the real fix is a proper, separated auth API:

- **`POST /auth/signup`** — body `{ phone, fullName, email?, role: "CUSTOMER" | "CAREGIVER" }`.
  - **Reject** if the phone is already registered → `409` "This number is already registered" (so you can never sign up into someone else's account).
  - Server-side **validation**: PK mobile format (E.164), `fullName` min length, valid `email` if present, `role` in the enum.
  - Create the account with the **requested role** (a CAREGIVER signup starts a caregiver-pending profile), removing the current customer→caregiver conversion hack in the FE.
  - Issue a **SIGNUP-purpose** OTP; complete via `POST /auth/signup/verify`.
- **`POST /auth/login` (OTP)** — must **require an existing account**: if the number isn't registered, return `404`/"No account — please sign up" instead of creating one.
- **Distinct OTP purposes** (`LOGIN` vs `SIGNUP`) so a code issued for one flow can't satisfy the other.
- **One phone = one account** is already enforced at the DB (`User.phone @unique`); the API semantics above make that visible to users instead of silently merging.
- **Email uniqueness not handled** — `User.email @unique`, but `PATCH /customer/me` doesn't catch a duplicate: it throws a raw `PrismaClientKnownRequestError` (P2002) → **unhandled 500** (seen in logs: `Unique constraint failed on … User_email_key`). Catch P2002 on `email` and return **`409` "Email already in use"** (the FE already maps that message to a friendly toast via `apiErrors`). Apply the same on the signup email.
- Nice-to-have: rate-limit OTP requests per phone/IP, and expire unverified signups.

Until this lands, the FE keeps: one universal `/login` (role-routed) + one `/signup` (new numbers only, role toggle). See *In-app messaging* / earlier sections for the rest.

## Admin tier-badge override (frontend built; backend pending)

The caregiver ranking tier (BRONZE/SILVER/GOLD/PLATINUM) is computed server-side by `computeCaregiverBadge()` (`backend/src/caregivers/badge.ts`) from experience + ratings + completed visits, and shown to customers and to the caregiver — but admins had no way to view or override it. The admin UI now has the control (**Admin → Caregivers → drawer → "Ranking tier"**), gated behind `CAN_OVERRIDE_BADGE` (`frontend/src/features/admin/lib/api/admin.ts`) until the backend provides:

1. **Schema:** add `badgeOverride CaregiverBadge?` (nullable) to `CaregiverProfile`; add the `CaregiverBadge` enum (BRONZE/SILVER/GOLD/PLATINUM) if not already present. Migration required.
2. **Effective badge:** return `profile.badgeOverride ?? computeCaregiverBadge(...)` as the effective tier everywhere the badge is served, and expose **both** on the admin payload — `badge` (effective) and `badgeOverride` (raw) — so the UI can distinguish "manual" vs "auto".
3. **Endpoint:** `POST /admin/caregivers/:id/badge` (`@Roles('ADMIN')`), body `{ badge: 'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|null }`; `null` clears the override (reverts to auto). Returns the updated `AdminCaregiverRecord` incl. `badge`/`badgeOverride`. Write an `auditLog` entry.
4. Flip `CAN_OVERRIDE_BADGE` to `true`.

## Other backend capabilities not yet surfaced in the UI (audit 2026-10-29)

From cross-referencing every backend route against the frontend API clients. Each is frontend-buildable once the noted backend piece exists:

- **Admin audit-log viewer** — **UI built, gated behind `CAN_AUDIT_LOG`.** Page `/admin/audit-logs` + `auditApi` + a (gated) platform nav link exist. **Backend must add** `GET /admin/audit-logs?entityType=&actorId=&page=&limit=` (`@Roles('ADMIN')`) → `Paginated<AuditLogEntry>`, each `{ id, actorId, actorName, action, entityType, entityId, metadata, at }` (join `actor.fullName` → `actorName`). Then flip the flag.
- **Call history** — ✅ **LIVE** (dev merge 2026-10-29). `GET /admin/call-logs?visitId=&page=&limit=` → `Paginated<CallLogEntry>` shipped; `CAN_CALL_LOGS = true`. Note: the backend filters by **`?visitId=`** (for incident investigation), **not** `?status=`, and the ValidationPipe rejects unknown query params — so the page lists all calls paginated with **no status dropdown** (status is still shown as a column).
- **Strike management** — **UI built, gated behind `CAN_MANAGE_STRIKES`.** The caregiver drawer gains a "Strikes" section (reset + add-with-reason). **Backend must add** `POST /admin/caregivers/:id/strikes` (`@Roles('ADMIN')`), body `{ op: 'reset' } | { op: 'add', reason: 'DECLINED'|'LATE_ARRIVAL'|'NO_SHOW', note?: string }`, returning the updated `AdminCaregiverRecord` (recomputed `strikeCount`); add writes a `CaregiverStrike` row, reset clears them; log to `auditLog`. Then flip the flag.
- **Config reset-to-default** — ✅ **Done.** `configApi.reset` now calls `DELETE /admin/config/:key`; the settings reset button removes the override so the row returns to `default` (no longer fakes it by PUT-ing the env default).
- **Admin payments** — ✅ **LIVE** (dev merge 2026-10-29). `GET /admin/payments?status=&visitId=&page=&limit=` → `Paginated<AdminPayment>` shipped; `CAN_ADMIN_PAYMENTS = true`. The real response is **nested** (`payment + visit.booking.{patient,customer,caregiver}`), so `AdminPayment` and the page columns read `p.visit.booking.*`. There is **no `?method=` filter** server-side (ValidationPipe rejects it), so the method dropdown was removed (method is still a column). Receipt download uses `GET /admin/payments/:id/receipt`.
- **Email diagnostics** — `GET /email/test-connection`, `POST /email/send-test` — internal ops tooling; intentionally not in the UI.
- **Returning-customer indicator (both sides)** — the customer caregiver profile shows "X visits together" + a clickable "Recent visits with you" list; the caregiver **request card** shows a "Returning · N prior visits" / "New customer" badge; and the caregiver **visit detail** shows the same badge + a clickable "Previous visits" list. All of this is computed **client-side** from each side's own bookings list (completed visits grouped by customer), so it works today with no backend change. **Accuracy caveat:** the caregiver-side counts only see the most recent 50 bookings (`GET /caregiver/bookings?limit=50`). For an exact count beyond that window, the backend already computes `priorVisitsWithCaregiver` on `BookingDetail` — adding the same field to `CaregiverBookingListItem` (the list item) would let the UI prefer the authoritative value. Nice-to-have, not blocking.

## ✅ Consolidated backend checklist (what the FE is waiting on)

Everything the frontend has **built but gated** needs exactly one backend endpoint (plus, in two cases, a migration) and then one boolean flag flipped in `frontend/src/features/admin/lib/api/admin.ts`. Ship these and the UI goes live with no further frontend work. Each row links to the detailed contract above.

| # | Feature | Endpoint(s) to add (`@Roles('ADMIN')`) | Migration? | Returns | Flip flag → `true` |
|---|---------|------------------------------------------|-----------|---------|--------------------|
| 1 | Tier-badge override | `POST /admin/caregivers/:id/badge` — body `{ badge: 'BRONZE'\|'SILVER'\|'GOLD'\|'PLATINUM'\|null }` (`null` = revert to auto) | **Yes** — add `badgeOverride CaregiverBadge?` to `CaregiverProfile`; serve effective `badgeOverride ?? computeCaregiverBadge(...)` and expose both `badge` + `badgeOverride` on the admin payload | updated `AdminCaregiverRecord` | `CAN_OVERRIDE_BADGE` |
| 2 | Strike management | `POST /admin/caregivers/:id/strikes` — body `{ op: 'reset' } \| { op: 'add', reason: 'DECLINED'\|'LATE_ARRIVAL'\|'NO_SHOW', note? }` | adds/clears `CaregiverStrike` rows (schema already has strikes) | updated `AdminCaregiverRecord` (recomputed `strikeCount`) | `CAN_MANAGE_STRIKES` |
| 3 | ✅ **DONE** Admin payments ledger | `GET /admin/payments?status=&visitId=&page=&limit=` (+ receipt) | No | `Paginated<AdminPayment>` (nested: `payment + visit.booking.{patient,customer,caregiver}`) | `CAN_ADMIN_PAYMENTS = true` |
| 4 | Audit-log viewer | `GET /admin/audit-logs?entityType=&actorId=&page=&limit=` | No | `Paginated<AuditLogEntry>` — `{ id, actorId, actorName, action, entityType, entityId, metadata, at }` (join `actor.fullName`) | `CAN_AUDIT_LOG` |
| 5 | ✅ **DONE** Call history | `GET /admin/call-logs?visitId=&page=&limit=` (no status filter) | No | `Paginated<CallLogEntry>` | `CAN_CALL_LOGS = true` |

**Shared notes for all five:** honour `page`/`limit` and return an accurate `total` (shape `Paginated<T>` — see *Pagination & data tables*); the list filters (`status`, `method`, `entityType`, `actorId`) must be applied **server-side**; and every write action (1, 2) must append an `auditLog` entry. All five list endpoints should accept the optional filters as query params and treat a missing filter as "all".

**Already shipped, no backend work pending:** config reset-to-default (`DELETE /admin/config/:key`) and caregiver tier **display** are live. Auth/sign-up separation (see *Authentication & sign-up*) is the one larger, non-gated backend item and is tracked separately.

## Pagination & data tables

List endpoints return `Paginated<T> = { items: T[]; page: number; limit: number; total: number }` and accept `?page=&limit=` (see `backend/src/common/dto/pagination.ts`). The frontend's shared `DataTable` runs in two modes:

- **Client-side** (default) for per-user lists that stay small — customer **bookings, payments, patients, addresses, disputes** fetch `limit: 100` once and then search / sort / paginate in the browser. Fine while a single family has well under ~100 rows.
- **Server-side** for operator lists that can grow large — admin **caregivers, payouts, promos, reverification** pass `page`/`limit` to the API and render just that page, driving the pager from `total`.

**Backend requirements for this to scale correctly:**
- Every growable list (admin caregivers/payouts, payments, and the bookings/visits browsers once added) must keep returning an accurate `total` and honour `page`/`limit`.
- Toolbar **filters** must be server-side on server-paginated lists (e.g. `status`, `reverifyDueBefore` already exist) — don't rely on client filtering of a truncated page.
- **Text search across pages** — ✅ **available** on **admin caregivers** (`?q=` name/phone/license) and **admin payouts** (`?q=` caregiver name/phone) as of the dev merge. Both pages now show a debounced server-side search box in the toolbar (typing resets to page 1). Other server-paginated lists still filter via dropdowns until their endpoints add `?q=`.

## Configuration (deployment)

