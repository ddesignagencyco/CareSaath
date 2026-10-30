# Backend — still open (frontend is done & waiting)

The frontend is fully built and wired against the dev-merged backend (tsc + eslint clean, 532 tests, production `next build` passes). This file lists **only what the backend still needs** for those features to work end-to-end. Paths are under `backend/src/`.

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

## 3. Emergency / nearest-doctor discovery

Today immediate (ASAP) booking is per-caregiver — at booking creation the backend checks the chosen caregiver's live `currentLat/Lng` is within `immediateMaxDistanceMeters` (5 km) and rejects if too far. The public search filters by **static** sub-city zones and returns **no distance**.

- **Nearby-now search** — add `GET /caregivers?immediate=true&lat=&lng=&specialty=DOCTOR` that filters to APPROVED, currently-available caregivers whose **live `currentLat/Lng`** is within `immediateMaxDistanceMeters` of the point, returns a **`distanceMeters`** per caregiver, and **sorts by distance**; excludes those with no recent fix. (nice) include an **ETA** too. Then the FE adds an Emergency tab ("N km · ~T min away").

## 4. Chat/call must be scoped to a real booking (defense in depth)

The chat endpoints (`messages`, reactions, media uploads) only check that the caller is a **party** to the booking — not the booking **status**. The FE already only shows a thread for `CONFIRMED`/`COMPLETED` bookings, but the API can still be used on a `REQUESTED`/`DECLINED`/`CANCELLED` booking. Reject chat `GET/POST` + media + reactions unless the booking is `CONFIRMED`/`COMPLETED` (e.g. 403 "Chat opens once the booking is confirmed"); optionally make a completed thread read-only after a grace period.

## 5. Nice-to-have

- **`priorVisitsWithCaregiver` on `CaregiverBookingListItem`** (`GET /caregiver/bookings`) — the caregiver request card shows a "returning customer" count computed client-side from the last 50 bookings; adding the field (already computed on `BookingDetail`) makes it exact.
