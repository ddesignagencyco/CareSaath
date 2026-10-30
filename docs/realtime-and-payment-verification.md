# Realtime, notifications, payment verification and receipts

API changes from Phase 15. All paths are under `/api/v1`. The OpenAPI spec at `/docs` documents the HTTP routes; this file covers the parts it cannot (the socket) and the behaviour changes the frontends must adopt.

## 1. WebSocket (live updates, no page reloads)

Connect once per signed-in session with Socket.IO, using the **access token**:

```ts
import { io } from 'socket.io-client';

const socket = io(API_ORIGIN, { auth: { token: accessToken }, transports: ['websocket'] });

socket.on('ready', ({ userId, role, expiresAt }) => { /* connected */ });
socket.on('auth.error', ({ message }) => { /* bad token / inactive account; the server then disconnects */ });
socket.on('auth.expired', () => { /* refresh the token, then reconnect with the new one */ });
```

- The server verifies the token and that the account is `ACTIVE`, then joins the socket to **only** `user:<id>` and `role:<ROLE>`. Nothing is broadcast: a client never receives events for records it is not entitled to.
- The socket is closed with `auth.expired` when the access token expires (15 min). Refresh the token (`POST /auth/refresh`) and reconnect. Socket.IO also reconnects on network drops by itself; give it a fresh `auth.token` in the `auth` callback form: `io(url, { auth: (cb) => cb({ token: getAccessToken() }) })`.
- The role is read from the database on connect. After `POST /caregiver/register` (role changes CUSTOMER → CAREGIVER) use the fresh tokens returned by that call and **reconnect**.
- Events can be missed while offline. After a reconnect, refetch what is on screen (and `GET /notifications/unread-count`).

### Events

| Event | Payload | Who gets it |
|---|---|---|
| `entity.updated` | `{ type, id, action, status?, data?, at }` | the parties to that record (see below) |
| `notification.created` | the notification row: `{ id, event, title, body, payload, audienceRole, status, createdAt, readAt: null }` | only the recipient |
| `notification.read` | `{ ids: string[] \| null, before: string \| null }` | the recipient's other open sessions |

`entity.updated.type` is one of `booking`, `visit`, `payment`, `payout`, `dispute`, `incident`, `caregiver`, `review`. Use it to invalidate or refetch the matching query (or patch the row using `status` and `data`). `action` says what happened (`created`, `accepted`, `declined`, `cancelled`, `rescheduled`, `en_route`, `checked_in`, `completed`, `initiated`, `customer_confirmed`, `caregiver_confirmed`, `paid`, `failed`, `requested`, `processing`, `transferred`, `confirmed`, `issue_reported`, `rejected`, `raised`, `resolved`, `reported`, `sos`, `updated`, `registered`, `document_uploaded`, `approved`, `suspended`, `reactivated`, ...).

Audience per type: `booking`, `visit`, `review` → the customer and the assigned caregiver; `payment` → customer, caregiver and all admins; `payout` → the caregiver and all admins; `dispute` → both parties and admins; `incident` → the reporter and admins; `caregiver` → that caregiver and admins.

## 2. Notifications

- Every notification is declared in `src/notifications/events.ts` with the roles it is for. The API **drops** a notification addressed to a user whose role it is not for, so feeds cannot mix roles. A test fails the build if an event is sent without being declared.
- `GET /notifications` now returns **one in-app row per notification** (channel `PUSH`) for the caller's **current role only**. Before, it also listed the SMS/WhatsApp delivery rows, which looked like duplicates. `?channel=SMS|WHATSAPP` still shows the delivery log. Rows now carry `title` and `body`.
- `GET /notifications/unread-count` → `{ unread }`. `POST /notifications/read` (`{ ids? | before? }`, or empty for all) marks read and syncs the user's other tabs via `notification.read`.
- **Browser Web Push** (optional; no vendor account): `GET /notifications/push/public-key` returns `{ enabled, publicKey }`; after `pushManager.subscribe(...)`, send the subscription JSON to `POST /notifications/push/subscriptions` (`{ endpoint, keys: { p256dh, auth }, platform? }`). `GET` lists the caller's devices, `DELETE` (same `{ endpoint }` body) unregisters on logout. The service-worker payload is `{ title, body, event, notificationId?, data }`. Expired endpoints are pruned automatically; a missing VAPID keypair disables remote delivery but not the in-app feed.
- Who gets what: customers get visit/booking/payment progress and dispute/safety updates; caregivers get booking requests, cancellations, prescriptions, reviews, cash steps, payout approval/transfer/rejection and verification results; admins get new caregivers and documents, disputes, safety reports and SOS, payout requests, confirmations and "not received" reports.

## 3. Cash needs both sides

Cash is `PAID` only after **both** confirm. Each side's confirmation is stored (`customerConfirmedAt`, `caregiverConfirmedAt`, and the caregiver's `confirmationNote`).

1. Customer starts the payment: `POST /customer/payments` `{ visitId, method: "CASH" }` (caregiver is notified).
2. Customer confirms they handed the money over: `POST /customer/payments/:id/confirm-cash`.
3. Caregiver confirms they received it: `POST /caregiver/payments/:id/confirm-cash` (optional `{ note }`).
4. Steps 2 and 3 can happen in either order. The second one settles the payment (`PAID`, both parties notified, receipt available).

Confirmations are allowed once the caregiver has arrived (visit `CHECKED_IN` or later) and are idempotent. A customer cannot cancel cash the caregiver already confirmed.

**Breaking:** `POST /caregiver/payments/:id/confirm-cash` no longer makes the payment `PAID` by itself; it stays `PENDING` with `caregiverConfirmedAt` set until the customer confirms. The caregiver visit detail's `payments[]` now includes both timestamps, so each app can show "waiting for the other side".

## 4. A visit cannot be closed without a verified payment

`POST /caregiver/visits/:id/note` (the step that moves a visit `CHECKED_OUT` → `COMPLETED`) now returns **400** unless the visit has a `PAID` payment: card settled, or cash confirmed by both sides. The message names what is missing, e.g. *"…the customer has not confirmed handing over the cash"*. Switch it off with the `visit.requirePaymentBeforeComplete` platform setting (`0`).

Suggested flow: after check-out, both apps show the payment step (using `payments[]` on the visit); once it is `PAID`, the caregiver submits the note.

## 5. Payouts: admin sends, caregiver confirms

`REQUESTED` → `PROCESSING` (admin approves) → `TRANSFERRED` (admin sent the money) → `PAID` (**caregiver confirms it arrived**). `REJECTED` is only possible before `TRANSFERRED`.

| Step | Route | Who |
|---|---|---|
| Request | `POST /caregiver/payouts` | caregiver (admins notified) |
| Approve | `POST /admin/payouts/:id/approve` | admin |
| Send | `POST /admin/payouts/:id/mark-transferred` `{ reference?, note? }` | admin |
| Confirm | `POST /caregiver/payouts/:id/confirm-received` | caregiver (admins notified) |
| Not arrived | `POST /caregiver/payouts/:id/report-not-received` `{ note }` | caregiver (admins notified; status stays `TRANSFERRED`, `issueNote` set) |
| Resend | `POST /admin/payouts/:id/mark-transferred` again | admin (clears the issue) |

Payout rows now include `transferredAt`, `transferReference`, `caregiverConfirmedAt`, `issueReportedAt`, `issueNote`. `TRANSFERRED` money counts as **pending** in `GET /caregiver/earnings` until confirmed.

**Breaking:** the new status `TRANSFERRED` exists. `POST /admin/payouts/:id/mark-paid` is kept as a deprecated alias of `mark-transferred` (it now ends at `TRANSFERRED`, not `PAID`); switch the admin UI to `mark-transferred`.

## 6. Receipts (PDF)

| Receipt | Routes |
|---|---|
| Payment (once `PAID`) | `GET /customer/payments/:id/receipt`, `GET /caregiver/payments/:id/receipt`, `GET /admin/payments/:id/receipt` |
| Payout transfer (once `TRANSFERRED` or `PAID`) | `GET /caregiver/payouts/:id/receipt`, `GET /admin/payouts/:id/receipt` |

Each returns `application/pdf` with `Content-Disposition: attachment; filename="…"`; add `?inline=true` for `inline` (in-app viewer). The routes need the bearer token, so fetch as a blob and save it, do not use a plain link:

```ts
const res = await api.get(`/customer/payments/${id}/receipt`, { responseType: 'blob' });
const name = /filename="(.+)"/.exec(res.headers['content-disposition'])?.[1] ?? 'receipt.pdf';
```

The customer copy never shows the platform commission; caregiver and admin copies do. Cash receipts list both confirmation times. An unverified payment returns 400; a record you are not a party to returns 404. Text outside Latin-1 (e.g. an Urdu name) prints as `?` in the PDF.

## 7. Operations

- New dependencies: `socket.io`, `@socket.io/redis-adapter`, `pdfkit`. Run `npm install`.
- Migrations: `20261026100000_notification_audience`, `20261026110000_cash_verification`, `20261026120000_payout_two_sided`, `20261026120100_payout_backfill`. Existing rows are backfilled (notifications get the recipient's role; settled cash and paid payouts count as confirmed).
- Multiple API instances are supported: socket events fan out through Redis (`REDIS_URL`). The load balancer must allow WebSocket upgrades (or sticky sessions if long-polling is enabled).
- Settings (`PUT /admin/config/:key`): `visit.requirePaymentBeforeComplete` (default 1).
