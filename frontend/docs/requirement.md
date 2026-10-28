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

## Configuration (deployment)

