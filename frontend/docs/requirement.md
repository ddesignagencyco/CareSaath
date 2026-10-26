# Backend requirements (open)

Open items the backend still needs. Nothing outside `frontend/` is changed from here; backend paths are relative to `backend/src/` (seed under `backend/prisma/`). Everything previously listed has been resolved by the dev pulls and the demo re-seed.

## Backend code

1. **✅ RESOLVED (P0) — A completed visit could never be paid (money flow broken).**
   `BookingsService` auto-flips a booking to `COMPLETED` when its last open visit completes (Phase 14), but `PaymentsService.loadPayableVisit` only allowed payment while the booking was `CONFIRMED`, so the instant the caregiver submitted their note neither cash nor card could be initiated — the customer had no way to pay for a finished visit and the caregiver was never paid (worst for cash-on-visit).
   **Fix applied (`payments/payments.module.ts`, loadPayableVisit):** the guard now allows `CONFIRMED` **or** `COMPLETED` (still blocking a CANCELLED/DECLINED visit): `if (status !== CONFIRMED && status !== COMPLETED) throw …`. The frontend already keeps the Pay panel + payment-due indicators visible for COMPLETED bookings, so the flow now works end-to-end (restart the backend to pick it up).

2. **P1 — Partial payout request forfeits the locked remainder (money integrity).**
   `PayoutsService.createPayoutRequest` (`payouts/payouts.module.ts`) greedily attaches **whole** PAID payments until `running >= amount`, so the last payment overshoots, but `payoutRequest.amount` records only the smaller requested figure. On admin mark-paid (`resolve`), the overshoot is never reconciled and never returned to `available` (only a REJECTED payout frees its payments). Example: two Rs 400 PAID visits (available Rs 800), caregiver requests Rs 500 → both Rs 800 locked → admin pays Rs 500 → **Rs 300 of settled earnings is lost permanently**; `pendingAmount`/"paid out" tiles then misreport.
   **Needed:** on settlement, split the overshooting payment or credit the remainder back to available; or constrain requests to whole-payment boundaries. **Frontend today:** the earnings page lets the caregiver request any amount (incl. a "half" button); a FE mitigation would be to restrict withdrawal to the full available balance or warn that partial amounts consume whole visits.

3. **P2 — Booking ignores caregiver availability (weekly hours AND blackout blocks).**
   `createCustomerBooking` (`bookings/bookings.module.ts`) never checks the caregiver's `AvailabilityRule`s or `AvailabilityBlock`s, so a customer can book a time outside the caregiver's hours or on a vacation/blackout day. The frontend's off-hours warning only compares weekly `availabilityRules` (and blocks aren't even exposed on the public caregiver response, so the FE can't warn about them).
   **Needed:** validate the requested occurrences against both availability rules and blocks on booking (reject or require override); and/or expose `AvailabilityBlock`s on `GET /caregivers/:id` so the frontend can warn.

4. **P2 — Admin safety queue can bury a newer CRITICAL incident on a later page.**
   `GET /admin/safety-incidents` (`admin/safety.module.ts`) lists oldest-first and the UI fetches 20/page, then sorts by priority **only within the fetched page**. With >20 open incidents a fresh CRITICAL/SOS lands on page 2 while page 1 shows older LOW/MEDIUM items, so the most severe isn't surfaced first.
   **Needed:** order admin safety-incidents by priority rank, then createdAt, server-side (so the global most-severe/oldest surface first).

5. **Seed cleanup deletes in the wrong FK order** (`prisma/seed.mjs`).
   Re-seeding a non-empty database fails with `VisitNote_visitId_fkey`: the cleanup deletes `VisitNote` rows only `where caregiverId in <seed caregivers>`, leaving notes that still reference the visits it then deletes. Delete `VisitNote` scoped by visit → booking → customer (matching the visit delete), or before the visit delete. Workaround today: `prisma migrate reset` to an empty DB, then seed.

## Configuration (deployment)

- **Stripe env + webhook for card payments.** Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_RETURN_URL` (and optionally `STRIPE_MIN_CHARGE_PKR`) on the backend (see `.env.example`), and point the Stripe webhook at the backend: `POST /api/v1/payments/webhook/stripe` (port 3000). Without `STRIPE_SECRET_KEY` the card checkout URL is a placeholder.

## Optional (nice-to-have, non-blocking)

- `?visitId=` on `GET /customer/payments`; visit info on `GET /disputes`; `lastLoginAt` on seeded users; a fixed "Cannot move a payout from X to Y" message so it can be translated.
