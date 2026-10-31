# Backend ↔ Frontend — status

The frontend is fully built and wired against the dev-merged backend (tsc + eslint clean, 516 tests, production `next build` passes; the in-browser mock/demo mode is gone — the app always talks to the real API). The backend backlog (commit `fb9b803` "frontend backlog") shipped all the endpoints the frontend was waiting on, and they are now wired. Paths below are under `backend/src/`.

## ✅ Done (backend shipped + frontend wired)

- **Deploy** — the dev-merged backend is live on Render (`/auth/signup`, `/realtime/ice-servers`, admin payments/customers/bookings, `/caregiver/service-areas`, nearby-now, chat delete/conversations, web push all respond). Local dev DB reset + reseeded with all 17 migrations.
- **Gated admin tools** — audit-log viewer, tier-badge override, strike add/reset. Endpoints shipped; the `CAN_*` flags in `frontend/src/features/admin/lib/api/admin.ts` are flipped on.
- **Customer tables** — server-side pagination + `?q=` search on payments, disputes (`GET /disputes?status=&q=&page=&limit=`), and bookings (`?group=active|waiting|past` + `?q=`, each item carries `derivedStatus`).
- **Emergency / nearby-now** — `GET /caregivers?immediate=true&lat=&lng=&specialty=` returns available-now caregivers with `distanceMeters`/`etaMinutes`, nearest first. FE: `/customer/emergency` (live GPS → list → immediate book), home banner, book page `?immediate=1`.
- **Chat delete** — `DELETE /bookings/:bookingId/messages/:id` (soft-delete). Wired (optimistic tombstone + rollback).
- **Relationship-scoped chat** — `GET /chat/conversations` (one per counterpart), `/chat/conversations/:id/messages` (full cross-booking history), `/chat/conversations/:id/read`. FE migrated: one thread per person, full history; sends go to the thread's `activeBookingId`, reactions/deletes to each message's `bookingId`; calls preserved.
- **Reply** — `replyToId` accepted on the message/media DTOs, persisted + returned; FE sends + renders the quote.
- **Chat scoped to open bookings** — conversations are built from `CHAT_OPEN_STATUSES` only.
- **OTP in dev** — the backend mirrors every OTP to email (MailHog at `http://localhost:18025`, `info@caresaath.com`), so no more reading the server console.
- **Web push (client)** — service worker (`public/sw.js`) + `usePushNotifications` subscribe flow, wired in both shells; `pushPublicKey`/`pushSubscribe` on `notificationsApi`.

## 🟡 Still open

1. **Web push — set VAPID keys on the backend.** `GET /notifications/push/public-key` returns `{ enabled:false, vapidPublicKey:null }` until the server has VAPID keys. The client subscribe flow silently no-ops until then; set the keys (and the subscribe/send path) so pushes actually deliver while the app is closed.
2. **Confirm `en-route` right after `accept`** — the caregiver accept auto-calls `POST /caregiver/visits/:id/en-route` for immediate bookings. Confirm there's no earliest-start-time guard that would 400 it for a now-booking (scheduled visits still start travel manually).

## Nice-to-have

- **`priorVisitsWithCaregiver` on `CaregiverBookingListItem`** (`GET /caregiver/bookings`) — if present, the caregiver request card's "returning customer" count uses it instead of the client-side estimate from the last 50 bookings.
