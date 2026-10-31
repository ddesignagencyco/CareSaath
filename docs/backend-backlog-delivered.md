# Backend: frontend backlog delivered

This answers the frontend's "Backend — still open" list. Paths are under `/api/v1`. Nothing under `frontend/` was changed: the `CAN_*` flags are yours to flip once this build is deployed.

## 0. Deploy

Render runs `npm run prisma:migrate && npm run seed` before each deploy (`render.yaml`). The new migration is `20261030100000_frontend_backlog`. If the service was set up in the dashboard instead of from the blueprint, set **Pre-Deploy Command** to the same thing there.

### Seeded test accounts (login = phone + OTP)

| Role | Phone | OTP also emailed to |
|---|---|---|
| ADMIN | +923000000000 (`ADMIN_PHONE`) | info@caresaath.com (`ADMIN_EMAIL`) |
| CUSTOMER | +923001110001 Ayesha Khan | info+ayesha@caresaath.com |
| CUSTOMER | +923001110002 Bilal Ahmed | info+bilal@caresaath.com |
| CAREGIVER | +923001110011 Fatima Noor (NURSING, APPROVED) | info+fatima@caresaath.com |
| CAREGIVER | +923001110012 Ali Raza (PHYSIO, APPROVED) | info+ali@caresaath.com |
| CAREGIVER | +923001110013 Sana Iqbal (ELDERLY, APPROVED) | info+sana@caresaath.com |
| CAREGIVER | +923001110014 Kashif Mehmood (PENDING, for the verification queue) | info+kashif@caresaath.com |
| DOCTOR | +923001110021 Dr. Hira Siddiqui | info+hira@caresaath.com |
| DOCTOR | +923001110022 Dr. Usman Tariq | info+usman@caresaath.com |

Demo data: patients, addresses, bookings in every state (REQUESTED / CONFIRMED / COMPLETED / CANCELLED / DECLINED), a payment, a review, a dispute, a safety incident, payout accounts, availability and the `WELCOME10` promo.

- **OTP delivery:** the SMS gateway is still a stub, so the code is written to the API log. When the account has an email and `SMTP_*` is set, the login code is **also emailed**. The `+alias` addresses only arrive if the mailbox supports plus-addressing. If it doesn't, read the code from the Render log (`[DEV-SMS] OTP for …`).
- **Re-deploys keep tester data:** accounts are upserted every time, but the demo bookings graph is built only when it's missing. Set `SEED_RESET=true` for one deploy to rebuild it. Set `SEED_ALLOW_PRODUCTION=false` once this becomes real production.
- **CI:** the e2e job re-runs the seed exactly as a deploy does and checks that the accounts exist.

## 1. Gated admin endpoints → flip `CAN_AUDIT_LOG`, `CAN_OVERRIDE_BADGE`, `CAN_MANAGE_STRIKES`

- `GET /admin/audit-logs?entityType=&entityId=&actorId=&action=(prefix)&from=&to=&page=&limit=` → `Paginated<{ id, actorId, actorName, actorRole, action, entityType, entityId, metadata, at }>`, newest first.
- `POST /admin/caregivers/:id/badge { badge: 'BRONZE'|'SILVER'|'GOLD'|'PLATINUM'|null }` → `AdminCaregiverRecord`. The record now carries `badge` (effective), `badgeOverride` and `computedBadge`. Public search, the public profile and `/caregiver/profile` all serve the effective badge.
- `POST /admin/caregivers/:id/strikes { op:'add', reason, note? } | { op:'reset' }` → `AdminCaregiverRecord` with the recomputed `strikeCount`.
  - **add** uses the same path as automatic strikes, so the threshold auto-suspend still applies.
  - **reset** deletes the strike rows and does **not** lift a suspension (use reactivate for that).
  - Both are audited.

## 2. Server-side tables

- `GET /disputes?status=&q=&page=&limit=`: send `page`/`limit` to get `Paginated<DisputeRow>`, the same row shape as `/admin/disputes`. **Without them it still returns the old plain array**, so the current customer and caregiver screens keep working until you switch.
- `GET /customer/bookings?group=active|waiting|past|all&q=`. Every item now has `derivedStatus` (`waiting` = REQUESTED; `active` = CONFIRMED with a visit still open; `past` = everything else, the same rule as `groupOf` in the bookings page).
- `?q=` free-text search:
  - `/customer/bookings`: patient name, caregiver name, rate
  - `/customer/payments`: patient / caregiver name, amount
  - `/disputes`: description, other party, patient

  Amounts match PKR or paisa.

## 3. Emergency / nearby-now → `CAN_EMERGENCY`

- **Caregiver toggle:** `PUT /caregiver/available-now { available }` → `{ acceptingImmediate, availableNow, locationUpdatedAt }`.
  - Only APPROVED caregivers can switch it on.
  - "Available now" means: toggle on **and** a live fix (`PATCH /caregiver/location`) no older than `caregiver.availableNowMaxFixAgeMinutes` (10) **and** not mid-visit **and** today isn't blacked out.
  - Keep sending location while the toggle is on. `DELETE /caregiver/location` switches it off.
  - `GET /caregiver/profile` exposes `acceptingImmediate` + `availableNow`.
- **Search:** `GET /caregivers?immediate=true&lat=&lng=&specialty=` (public).
  - Returns available-now caregivers within `booking.immediateMaxDistanceMeters` (5 km), nearest first.
  - Each result has `distanceMeters` and `etaMinutes` (at `booking.immediateAvgSpeedKmh`, 20 km/h).
  - Never cached (`X-Cache: BYPASS`). Returns 400 without lat/lng.
  - It uses the same distance rule as immediate-booking creation, so anyone listed can be booked with `isImmediate: true`.

## 4. Chat

- **4a** `DELETE /bookings/:bookingId/messages/:id`:
  - Sender only, within `chat.deleteGraceMinutes` (60). Idempotent.
  - Returns a tombstone (`deletedAt` set, `body`/`url` null), and lists return it the same way.
  - Both parties get `entity.updated { type:'chat_message', action:'deleted' }`.
  - A quoted reply to a deleted message shows `replyTo.body: null`.
- **4b** One thread per person, no schema change:
  - `GET /chat/conversations` → `[{ counterpartUserId, counterpartName, caregiverId, bookingIds, activeBookingId, lastMessage, unreadCount, lastActivityAt }]`
  - `GET /chat/conversations/:counterpartUserId/messages` (paginated, the full history across the pair's bookings; each message carries `bookingId`)
  - `PATCH /chat/conversations/:counterpartUserId/read`
  - Send new messages to `POST /bookings/:activeBookingId/messages`. `activeBookingId: null` means the thread is read-only.
- **4c** Chat GET/POST, reactions and media uploads return **403 "Chat opens once the booking is confirmed"** unless the booking is CONFIRMED/COMPLETED. COMPLETED threads stay readable but read-only. Admins can read any thread.
- **4d** Already wired: `replyToId` is accepted on `POST …/messages` and on `POST …/media/uploads/:id/complete`, persisted, and returned (`replyToId` + `replyTo`).

## 5. Web Push

- `GET /notifications/push/public-key` → `{ enabled, vapidPublicKey }`. Use the key as `applicationServerKey`.
- `POST /notifications/push/subscribe` with the `PushSubscription.toJSON()` body `{ endpoint, keys: { p256dh, auth } }`.
- `POST /notifications/push/unsubscribe { endpoint }`.
- Every in-app (PUSH-channel) notification is also sent as a Web Push with payload `{ id, event, title, body, data }`. It respects the PUSH preference, and dead endpoints are pruned.
- Push stays off until `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set on Render. Generate them with `npx web-push generate-vapid-keys`.

## 6. Visit auto-start

Confirmed: there's no time guard on `POST /caregiver/visits/:id/en-route`. CONFIRMED → EN_ROUTE is allowed straight after `accept`.

## 7. `priorVisitsWithCaregiver`

`GET /caregiver/bookings` items now carry `priorVisitsWithCaregiver`: completed visits with that customer on their *other* bookings, the same as on `BookingDetail`. Items also carry `derivedStatus`, and the endpoint accepts `?group=` and `?q=`.
