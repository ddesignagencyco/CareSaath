# CareSaath — open requirements

The Phase 15 + 29-Oct dev pulls are **fully adopted** in `frontend/` (tsc, eslint and the 532-test suite green). This file lists only what's **still open**. Backend paths are under `backend/src/`; seed under `backend/prisma/`.

> Everything that was in the old, long version of this file (payout integrity, availability-on-booking, safety-queue ordering, seed FK order, license-number privacy, counterparty-phone privacy, promo funding, `hasNote`, auth split + email-409, admin bookings/visits browser, customers management, call-logs, disputes mediation, notification preferences, strikes reset/list, STUN/TURN, live-GPS backend, rich-chat-media backend, sub-city service-area backend) has **shipped in the dev merge and been wired/adopted in the frontend.** Removed here to keep this clean.

---

## A. Backend endpoints the frontend is built against but still gated

Each feature's UI, API client, types, nav and i18n already exist; it's hidden behind a `CAN_*` flag in `frontend/src/features/admin/lib/api/admin.ts`. Ship the endpoint, flip the flag.

1. **Audit-log viewer** — `GET /admin/audit-logs?entityType=&actorId=&page=&limit=` (`@Roles('ADMIN')`) → `Paginated<AuditLogEntry>` where each is `{ id, actorId, actorName, action, entityType, entityId, metadata, at }` (join `actor.fullName`). Flag `CAN_AUDIT_LOG`.
2. **Tier-badge override** — `POST /admin/caregivers/:id/badge` body `{ badge: 'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|null }` (`null` = revert to auto). **Migration:** add `badgeOverride CaregiverBadge?` to `CaregiverProfile`; serve `badgeOverride ?? computeCaregiverBadge(...)` and expose both `badge` + `badgeOverride`. Returns the updated `AdminCaregiverRecord`; write an `auditLog`. Flag `CAN_OVERRIDE_BADGE`.
3. **Strike add/reset** — `POST /admin/caregivers/:id/strikes` body `{ op: 'reset' } | { op: 'add', reason: 'DECLINED'|'LATE_ARRIVAL'|'NO_SHOW', note? }` → updated `AdminCaregiverRecord` (recomputed `strikeCount`); add writes a `CaregiverStrike`, reset clears them; log to `auditLog`. (`GET /admin/caregivers/:id/strikes` history already exists.) Flag `CAN_MANAGE_STRIKES`.

## B. Customer tables → server-side pagination & search (raised 2026-10-30)

Admin tables are server-paginated; customer **payments** is too. These block the rest:

4. **Customer disputes** — `GET /disputes` (`listMine`) returns a **plain array**, no `page`/`limit`. Make it `Paginated<DisputeRow>` + accept `?status=&page=&limit=` (reuse the `/admin/disputes` shape). Then the customer disputes table goes server-side.
5. **Customer bookings** — `/customer/bookings` paginates by `?status=` only, but the UI groups by **active / waiting / past**, derived from each booking's *visit* completion. Expose `?group=active|waiting|past|all` (or a per-booking `derivedStatus`) so it can be server-paginated without losing the tabs. Until then bookings stays client-side (fetch 100).
6. **Free-text search (`?q=`)** on `/customer/payments`, `/customer/bookings`, `/customer/disputes` (patient / caregiver name, amount) so a search box can hit the whole DB — like the admin caregivers/payouts lists already do. Customer payments is already server-paginated, so its search box is hidden until this lands.

## C. Nice-to-have (backend)

7. **`priorVisitsWithCaregiver` on `CaregiverBookingListItem`** (`GET /caregiver/bookings`) — the caregiver request card shows a "returning customer" count computed client-side from the last 50 bookings; adding the field (already computed on `BookingDetail`) makes it exact. The UI renders it conditionally, no flag.

## B2. Emergency / nearest-doctor discovery (QA 2026-10-30 — new backend work)

**What exists today:** immediate (ASAP) booking is a per-caregiver toggle — the customer opens a *specific* caregiver and picks "Immediate". At booking **creation** the backend checks that caregiver's live `currentLat/Lng` is within `booking.immediateMaxDistanceMeters` (default **5 km**) of the visit address and rejects if too far / if they haven't shared a location. The public search (`GET /caregivers?specialty=&city=&lat=&lng=`) filters by **static sub-city service-zone coverage**, **not** live location, and **does not return a distance**.

**What's missing (for "Emergency → show only the nearest available doctors, N km away"):**
8. **Nearby-now search endpoint.** Add a discovery mode, e.g. `GET /caregivers?immediate=true&lat=&lng=&specialty=DOCTOR`, that:
   - filters to APPROVED, **currently-available** caregivers whose **live `currentLat/Lng`** is within `immediateMaxDistanceMeters` of the point (not static zones);
   - returns a **`distanceMeters`** (or `km`) field per caregiver, and **sorts by distance** (nearest first);
   - excludes caregivers with no recent live fix (they can't take an ASAP visit).
   Without this the FE can't show "this doctor is N km from you" or hide the 50-km-away ones up front — it can only let the customer pick someone and fail at booking time.
9. **(nice) ETA** alongside `distanceMeters` (minutes at average speed), as the visit-location endpoint already computes.

Once #8 lands, the FE adds an **Emergency tab** (customer's GPS/address → nearest doctors list with "N km · ~T min away", book immediately). Until then the per-caregiver Immediate toggle + the 5 km booking-time guard is the only emergency path.

## B3. Chat/call must be scoped to a real booking relationship (QA 2026-10-30)

The chat endpoints (`GET/POST /bookings/:bookingId/messages`, reactions, media uploads) only check that the caller is **a party** to the booking (customer / assigned caregiver / admin) — they do **not** check the booking's **status**. So the API can still open/post a conversation on a `REQUESTED` (not yet accepted), `DECLINED` or `CANCELLED` booking, i.e. you could message a caregiver you never actually booked.

- **FE already fixed (2026-10-30):** the messages list now only builds a thread for bookings whose status is `CONFIRMED` (upcoming) or `COMPLETED` (past), both customer and caregiver side — so pending/declined/cancelled bookings don't show a conversation (and since calls start from a thread, calls are scoped too).
- **Backend needed (defense in depth):** reject chat `GET/POST` + media + reactions when the booking status isn't `CONFIRMED`/`COMPLETED` (e.g. 403 "Chat opens once the booking is confirmed"), so the rule can't be bypassed via the API. Optionally make a `COMPLETED` booking's thread read-only (archived) after a grace period.

---

## D. Frontend still to build (backend already shipped, UI pending)

8. ✅ **DONE (2026-10-30) — Chat media / voice.** Images, files and voice notes are now **persisted to the backend** (not local demo) via the resumable upload pipeline (`POST …/media/uploads` → `PUT …/uploads/:id/chunks/:index` in ≤2 MB chunks → `POST …/uploads/:id/complete`), shown from the message's signed `url`; **reactions** go through `POST …/messages/:id/reactions` (aggregated per emoji), and **reply** passes `replyToId`. Optimistic bubble while uploading; wired in both the customer and caregiver apps. **Known backend limits:** no delete/edit-message endpoint (delete stays local), video files are stored as `FILE` (no `VIDEO` type), the original filename and voice-note duration aren't returned on the stored message.
9. ✅ **DONE (2026-10-30) — Sub-city service areas (Option A).** Caregiver profile has a **Coverage areas** card (`ServiceAreasCard`): a multi-select of predefined Lahore areas (`LAHORE_AREAS`, approximate centres) + a radius, saved via `PUT /caregiver/service-areas` (empty = whole city), with a Google-Maps `LocationMap` preview of the first area. The customer caregiver profile shows "Covers: …" from the public `serviceAreas`, and the backend search already filters by these zones when given `lat/lng`. Full EN/UR i18n. *(No interactive map picker — Option A, as requested.)*
10. ✅ **DONE (2026-10-30) — Live-location map.** Caregiver streams high-accuracy GPS to `POST /caregiver/visits/:id/location` every ~12s while `EN_ROUTE` (`useVisitLocationStream`, respects the sharing opt-out, mounted on the caregiver visit detail page). The customer visit page shows a live `LocationMap` + ETA while `EN_ROUTE` (`LiveLocationMap`), seeded by `GET /customer/visits/:id/location` and updated live by the `visit.location` socket event (wired into `useRealtime` → query key `["visit-location", id]`). Full EN/UR i18n.

## E. Deploy / production config

- **Frontend:** set `NEXT_PUBLIC_API_URL` to the production backend (`frontend/.env.local` is on `http://localhost:3000/api/v1` for local dev); `NEXT_PUBLIC_USE_MOCKS=false`.
- **Backend:** `REDIS_URL` set (socket events fan out via Redis); the load balancer must allow **WebSocket upgrades** (or sticky sessions). Set **TURN** env so `GET /realtime/ice-servers` returns TURN (else STUN-only — calls can fail behind strict NAT). Run `prisma migrate deploy` + `prisma generate` on deploy.

---

## Reference: pagination & calls (current state)

- **Pagination** — shared `Paginated<T> = { items, page, limit, total }`. Server-side: all admin tables + customer payments. Client-side (fetch 100): customer bookings, disputes, patients, addresses (see §B to move the first two).
- **Calls** — real WebRTC over `call:*` signalling + `CallLog`; ICE from `GET /realtime/ice-servers` (STUN + TURN). **Audio-only** (video disabled product-wide; re-enable by restoring the video button in `src/shared/chat/chat.tsx`).
- **Auth** — real split: `POST /auth/signup` (+ `/auth/signup/verify`) for new numbers (409 if registered); `POST /auth/otp/request` (+ `/auth/otp/verify`) for login only (404 for unknown). `PATCH /customer/me` returns 409 on a duplicate email.
