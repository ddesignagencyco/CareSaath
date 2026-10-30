# Backend — still open (frontend is done & waiting)

The frontend is fully built and wired against the dev-merged backend (tsc + eslint clean, 516 tests, production `next build` passes; the in-browser mock/demo mode has been removed — the app always talks to the real API). This file lists **only what the backend still needs** for those features to work end-to-end. Paths are under `backend/src/`.

## 0. Deploy the dev-merged backend (blocker)

The live API (`https://caresaath-api.onrender.com`) is an **older build**: `POST /api/v1/auth/otp/request` works, but every dev-merge endpoint (`/auth/signup`, `/realtime/ice-servers`, `/admin/payments`, `/admin/customers`, `/admin/bookings`, `/caregiver/service-areas`, …) returns **404**. Redeploy Render from the branch that has the dev-merge commits (`d144c80` + `eddee54`) and run `prisma migrate deploy` + `prisma generate` there, or the new features 404 in production.

## 1. Gated admin endpoints (UI built behind a `CAN_*` flag — ship the endpoint, flip the flag in `frontend/src/features/admin/lib/api/admin.ts`)

- **Audit-log viewer** — `GET /admin/audit-logs?entityType=&actorId=&page=&limit=` (`@Roles('ADMIN')`) → `Paginated<AuditLogEntry>` `{ id, actorId, actorName, action, entityType, entityId, metadata, at }`. Flag `CAN_AUDIT_LOG`.
- **Tier-badge override** — `POST /admin/caregivers/:id/badge` `{ badge: 'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|null }` (`null` = auto). **Migration:** add `badgeOverride CaregiverBadge?`; serve `badgeOverride ?? computeCaregiverBadge(...)`, expose both `badge` + `badgeOverride`; write an `auditLog`. Flag `CAN_OVERRIDE_BADGE`.
- **Strike add/reset** — `POST /admin/caregivers/:id/strikes` `{ op:'reset' } | { op:'add', reason, note? }` → updated `AdminCaregiverRecord` (recomputed `strikeCount`); add writes a `CaregiverStrike`, reset clears them; log to `auditLog`. (`GET …/strikes` history already exists.) Flag `CAN_MANAGE_STRIKES`.

## 2. Customer tables → server-side pagination & search

- **Customer disputes** — `GET /disputes` (`listMine`) returns a plain array; make it `Paginated<DisputeRow>` + accept `?status=&page=&limit=` (reuse the `/admin/disputes` shape) so the customer disputes table can go server-side.
- **Customer bookings** — `/customer/bookings` paginates by `?status=` only, but the UI groups by **active / waiting / past** (derived from each booking's visit completion). Expose `?group=active|waiting|past|all` (or a per-booking `derivedStatus`) so it can be server-paginated without losing the tabs.
- **Free-text search (`?q=`)** on `/customer/payments`, `/customer/bookings`, `/customer/disputes` (patient / caregiver name, amount) so a search box can hit the whole DB. (Admin caregivers/payouts already have `?q=`; customer payments is already server-paginated, its search box is hidden until this lands.)

## 3. Emergency / nearest-available discovery

**Target flow (recommended):** customer taps "Need care now" → the app reads their **live GPS** → calls the nearby-now search → shows APPROVED, **available-now** caregivers sorted by distance ("N km · ~T min away") → customer picks one → an **immediate** booking is created (`isImmediate`) → the caregiver gets the request and, on accept, is taken straight into the visit and auto-starts travel (already wired on the FE — see §6). The customer then watches the live-location map.

Today immediate (ASAP) booking is per-caregiver — at booking creation the backend checks the chosen caregiver's live `currentLat/Lng` is within `immediateMaxDistanceMeters` (5 km) and rejects if too far. The public search filters by **static** sub-city zones and returns **no distance**. Two backend pieces are missing:

- **Available-now signal** — a caregiver flag the backend can filter on: online + accepting immediate work right now (derive from the availability settings + a recent heartbeat/live fix, or an explicit "available now" toggle). Expose it so the search can filter to caregivers who can actually respond immediately.
- **Nearby-now search** — add `GET /caregivers?immediate=true&lat=&lng=&specialty=` that filters to APPROVED, **available-now** caregivers whose live `currentLat/Lng` is within `immediateMaxDistanceMeters` of the point, returns a **`distanceMeters`** (and, nice, an **`etaMinutes`**) per caregiver, and **sorts by distance**; excludes those with no recent fix.

**Frontend plan (ready to build behind a `CAN_EMERGENCY` flag once the two above exist):** an "Emergency / Need care now" entry on the customer home + a results screen that geolocates (reusing `@shared/lib/geo`) and lists the nearby-now caregivers with distance/ETA, booking immediate on tap.

## 4. Chat

**4a. Delete message (missing endpoint).** There is no delete endpoint, so "delete message" on the FE is **local-only** — it hides the bubble on the sender's device but it reappears on refresh/other devices. Add `DELETE /bookings/:bookingId/messages/:id` (sender-only, within a grace window) that soft-deletes (`deletedAt`) and emits the usual `entity.updated` so every party clears it live. The FE already renders `deletedAt` as a "message deleted" tombstone, so wiring is a one-liner once the route exists.

**4b. Thread scoped to the relationship, not a single booking (fixes duplicate conversations).** Chat is keyed by `bookingId`, so a caregiver↔customer pair with more than one booking has a **separate thread (and separate history) per booking**. The FE now collapses the list to **one thread per person** (keeping the most relevant booking), but the shown history is still only that one booking's. The clean fix is a conversation scoped to the **(customer, caregiver)** pair (or a `conversationId` that spans their bookings) so the full history lives in one thread. Until then the FE dedup is the stopgap.

**4d. Reply (`replyToId`) must be on the message DTO.** The FE sends `replyToId` on text send **and** media upload, and renders the quoted message from `BackendChatMessage.replyToId`. Because the API runs `ValidationPipe({ forbidNonWhitelisted: true })`, a reply **400s** unless the message-create (and media-complete) DTO explicitly accepts `replyToId`; the backend must also persist it and return it on the message so the quote survives a refresh. (Verify this is wired alongside media/reactions — if not, replies silently fail with "couldn't send".)

**4c. Scope chat to a real booking (defense in depth).** The chat endpoints (`messages`, reactions, media uploads) only check that the caller is a **party** to the booking — not the booking **status**. The FE already only shows a thread for `CONFIRMED`/`COMPLETED` bookings, but the API can still be used on a `REQUESTED`/`DECLINED`/`CANCELLED` booking. Reject chat `GET/POST` + media + reactions unless the booking is `CONFIRMED`/`COMPLETED` (e.g. 403 "Chat opens once the booking is confirmed"); optionally make a completed thread read-only after a grace period.


## 6. Visit auto-starts on accept (FE behaviour — confirm backend allows it)

The caregiver "accept" now navigates straight to the visit and, for **immediate** bookings, auto-calls `POST /caregiver/visits/:id/en-route` so the caregiver lands on the check-in / live-location screen without a separate "Start travel" tap. Please confirm `en-route` is accepted immediately after `accept` for an immediate visit (no earliest-start-time guard that would 400 it). Scheduled visits still start travel manually when it's time.

## 7. Nice-to-have

- **`priorVisitsWithCaregiver` on `CaregiverBookingListItem`** (`GET /caregiver/bookings`) — the caregiver request card shows a "returning customer" count computed client-side from the last 50 bookings; adding the field (already computed on `BookingDetail`) makes it exact.
