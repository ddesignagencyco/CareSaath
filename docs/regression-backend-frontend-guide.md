# Frontend guide: `regression-backend` branch

Everything below is new on this branch (off `dev`). All paths are under `/api/v1`; the OpenAPI spec at `/docs` documents full request/response shapes — this file covers the parts it can't (the socket, WebRTC signaling) and the behaviour each feature needs the frontend to build around. Nothing here changes any *existing* endpoint's contract except where explicitly marked **Breaking**.

## 1. Caregiver pricing bracket

A caregiver has **one rate** they charge (`ratePerVisit`, paisa) plus a **self-set bracket** (`minRatePerVisit`, `maxRatePerVisit`) their rate must stay inside. There is no "customer picks a price in a range" flow — the bracket is just a guard rail the caregiver sets for themselves.

- `POST /caregiver/register` — now accepts optional `minRatePerVisit`, `maxRatePerVisit`. Omit both and the bracket defaults to a single point at `ratePerVisit` (so a caregiver who never touches this is unaffected).
- `PATCH /caregiver/profile` — accepts the same two fields plus `ratePerVisit`. Server validates `min <= max` and `min <= ratePerVisit <= max` using whichever values are in the request merged with what's already on file. **400** with a message naming the bracket if violated.
- To widen the bracket and move the rate in one call, send both in the same `PATCH` (the new bracket applies before the rate check).

```ts
// Caregiver settings screen
await api.patch('/caregiver/profile', { ratePerVisit: 75000, minRatePerVisit: 50000, maxRatePerVisit: 80000 });
```

Show the caregiver their current bracket (`GET /caregiver/profile` returns `minRatePerVisit`/`maxRatePerVisit`) as a slider or two number inputs around their rate field.

## 2. Immediate ("ASAP") bookings

`POST /customer/bookings` accepts a new optional `isImmediate: boolean`. When true:

- Must be `type: "SINGLE"` (400 if combined with `RECURRING`).
- The caregiver has a **short response window** (`booking.immediateRespondWindowMinutes`, default **10 minutes**) instead of the normal one (default 60). Show a countdown using `respondBy` on the returned booking.
- The caregiver must already be **near** the visit address: their last-known location (`PATCH /caregiver/location`, see below) must be within `booking.immediateMaxDistanceMeters` (default 5000m) of the booking's address, or the create call returns **400** ("This caregiver is about N m away…"). Surface this to the customer as "this caregiver isn't available for an immediate visit right now — try scheduling instead, or pick someone closer."
- If the caregiver has never called `PATCH /caregiver/location`, immediate bookings against them always 400 ("has not shared a live location").

```ts
// Caregiver app: call periodically while the app is foregrounded (e.g. every 1–2 minutes)
await api.patch('/caregiver/location', { lat: 31.5204, lng: 74.3587 });
```

```ts
// Customer app: "Book now" vs "Schedule" toggle
await api.post('/customer/bookings', { ...fields, isImmediate: true });
```

**Expiry is now enforced.** `respondBy` existed before but was never checked; it now is. A background sweep (every `BOOKING_EXPIRY_INTERVAL_MINUTES`, default 5) auto-declines any `REQUESTED` booking past its `respondBy`, same as if the caregiver had declined it: the customer gets a `booking.declined` notification/`entity.updated`, and `cancelReason` is set to `"Expired: the caregiver did not respond in time"`. If you already render `cancelReason`/declined bookings, no new UI is needed, but note that **a booking you thought was still "awaiting response" can flip to DECLINED without any caregiver action** — don't assume `REQUESTED` is stable past `respondBy`.

## 3. A caregiver can't double-book themselves

`POST /caregiver/bookings/:id/accept` now returns **400** ("You are currently on a visit; complete it before accepting another booking") if the caregiver has any *other* visit in `EN_ROUTE`, `CHECKED_IN`, or `IN_PROGRESS`. A future `CONFIRMED` visit on a different day is unaffected — this only blocks accepting while physically mid-visit. Show this 400 message as a toast/snackbar on the caregiver's incoming-requests screen; there's no new field to poll for, it's just a possible accept-time rejection.

## 4. Repeat-visit count

Every booking detail response (`GET /customer/bookings/:id`, `GET /caregiver/bookings` list items — wherever `getBooking`/`getCustomerBooking` is used) now includes:

```ts
priorVisitsWithCaregiver: number // completed visits this caregiver already did for this customer's family, excluding this booking
```

Use it for a "You've booked Fatima 3 times before" badge on the booking confirmation/detail screen. It's computed live (not cached), so it's always current.

## 5. Doctors

`Specialty` gained a `DOCTOR` value, alongside `NURSING`, `PHYSIOTHERAPY`, `POST_SURGERY_CARE`, `ELDERLY_CARE`. Doctors are **regular caregiver profiles** with `specialty: "DOCTOR"` — they go through the exact same registration (`POST /caregiver/register`), verification, document upload, search, and booking flow as any other caregiver. No new endpoints for onboarding a doctor; just add `DOCTOR` everywhere the app renders/filters a `Specialty` enum (registration dropdown, search filters, profile badges). Two demo doctor accounts are seeded (`+923001110021`, `+923001110022`) for local testing.

## 6. Medical orders (doctor-only diagnosis / prescriptions / lab orders)

**New, distinct from the existing prescription upload.** `POST /customer/bookings/:id/prescriptions` (unchanged) is still "attach a scanned prescription file." This is new: an **in-app structured record** that only a verified `DOCTOR`-specialty caregiver can author.

| Route | Who | What |
|---|---|---|
| `POST /caregiver/visits/:visitId/medical-orders` | Doctor assigned to the visit | Create `{ diagnosis?, medicines?: [...], labTests?: [...] }` |
| `GET /caregiver/visits/:visitId/medical-orders` | Any caregiver assigned to the visit | List |
| `GET /customer/visits/:visitId/medical-orders` | The customer who owns the visit | List |

```ts
await api.post(`/caregiver/visits/${visitId}/medical-orders`, {
  diagnosis: 'Upper respiratory tract infection',
  medicines: [{ name: 'Amoxicillin 500mg', dosage: '1 tablet', frequency: 'Twice daily', duration: '7 days', instructions: 'After meals' }],
  labTests: [{ name: 'Complete Blood Count (CBC)', instructions: 'Fasting required' }],
});
```

- `POST` from a non-doctor (e.g. a nurse) returns **403**. A non-verified doctor also gets 403. Only show the "Record diagnosis / prescribe" action on the caregiver visit screen when `GET /caregiver/profile` reports `specialty === 'DOCTOR'` **and** `verificationStatus === 'APPROVED'`.
- The customer gets a `medical_order.created` notification and an `entity.updated` (`type: 'visit'`, `action: 'medical_order_created'`, `data: { medicalOrderId }`) when one is created — refetch `GET /customer/visits/:visitId/medical-orders` on that event.
- `medicines`/`labTests` are free-form JSON arrays (`{ name, dosage?, frequency?, duration?, instructions? }` / `{ name, instructions? }`) — render as a simple list, there's no catalogue/autocomplete behind them.

## 7. In-app chat

One chat thread per **booking** (covers every visit under a recurring booking).

| Route | What |
|---|---|
| `GET /bookings/:bookingId/messages?page=&limit=` | Paginated history, newest first |
| `POST /bookings/:bookingId/messages` `{ body }` | Send |
| `PATCH /bookings/:bookingId/messages/read` | Mark every message *from the other party* as read |

Available to the booking's customer, its assigned caregiver, or an admin — anyone else gets 404. A new message pushes live to the other party over the socket as `entity.updated` with `type: 'chat_message'`:

```ts
socket.on('entity.updated', (e) => {
  if (e.type === 'chat_message') {
    const { bookingId, senderId, body } = e.data;
    // append to the open thread if bookingId matches, else bump an unread badge
  }
});
```

There's no typing-indicator or delivery-receipt event — just created/read state via the REST calls above.

## 8. In-app calls (WebRTC signaling)

**No new HTTP routes.** This is entirely over the same Socket.IO connection you already use for `entity.updated`/`notification.created` (see `docs/realtime-and-payment-verification.md` §1 for how to connect). Audio/video itself is **peer-to-peer WebRTC** between the two apps — the backend only relays signaling messages and keeps an audit log (`CallLog`). You still need your own STUN (and, if you need to support restrictive networks, TURN) server config on the client; the backend does not provide one.

A call may only be started between two users who currently share an **active visit** (not yet `COMPLETED`/`CANCELLED`/`DECLINED`) — i.e. the customer and the caregiver assigned to that visit.

Client → server events:

| Event | Payload | Effect |
|---|---|---|
| `call:invite` | `{ visitId, calleeId, sdp }` | Creates the call; relays `call:incoming` to the callee |
| `call:answer` | `{ callId, sdp }` | Marks the call connected; relays `call:answered` to the caller |
| `call:ice-candidate` | `{ callId, candidate }` | Relays to the other participant |
| `call:end` | `{ callId }` | Marks ended (duration recorded); relays `call:ended` |
| `call:reject` | `{ callId }` | Marks rejected; relays `call:rejected` to the caller |

Server → client events you listen for: `call:incoming` `{ callId, visitId, callerId, sdp }`, `call:answered` `{ callId, sdp }`, `call:ice-candidate` `{ callId, candidate }`, `call:ended` `{ callId }`, `call:rejected` `{ callId }`, and `call:error` `{ message }` (sent back to *you* on any failure — e.g. inviting someone you don't share an active visit with, or a `callId` that isn't yours).

```ts
// Caller
const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
pc.onicecandidate = (e) => e.candidate && socket.emit('call:ice-candidate', { callId, candidate: e.candidate });
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('call:invite', { visitId, calleeId, sdp: offer });
socket.on('call:answered', async ({ sdp }) => pc.setRemoteDescription(sdp));

// Callee
socket.on('call:incoming', async ({ callId, sdp }) => {
  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('call:answer', { callId, sdp: answer });
});

// Either side, on ICE candidates from the other party
socket.on('call:ice-candidate', ({ candidate }) => pc.addIceCandidate(candidate));

// Hang up
socket.emit('call:end', { callId });
```

Any failure (no shared active visit, unknown `callId`, not a participant) comes back as `call:error` — show it as a toast and let the user retry rather than leaving the UI in a ringing state.

## 9. Strikes & auto-suspension

Caregivers now accumulate **strikes** for two behaviours, fully automatic (no new call for the frontend to make):

- **Declining** a booking (`POST /caregiver/bookings/:id/decline`) — unchanged call, now also records a strike server-side.
- **Checking in late**: `POST /caregiver/visits/:id/check-in` records a strike if the check-in happens more than `visit.lateArrivalGraceMinutes` (default 15) after the visit's scheduled window start. The check-in itself still succeeds — lateness is penalized, not blocked.

Crossing `caregiver.strikeThreshold` (default 3) **auto-suspends** the caregiver (`verificationStatus` flips to `SUSPENDED`, same enum value used for admin-driven suspensions). Effects to build for:

- The caregiver gets a `caregiver.strike.recorded` notification after every strike, and a `caregiver.suspended` notification + `entity.updated` (`type: 'caregiver'`, `action: 'suspended'`) if auto-suspended — handle it exactly like an admin suspension (block them from accepting new work, show a "your account is suspended" banner).
- Admins get `caregiver.suspended.admin` + the same `entity.updated`, so the existing admin caregiver-list screen's suspension handling covers this with no new code if it already reacts to `verificationStatus === 'SUSPENDED'`.
- There's no dedicated "strike history" endpoint yet; if the admin UI needs one, that's a follow-up, not something already exposed.

## 10. Caregiver badges (ranking)

`badge: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM"` is now included wherever a caregiver's public profile is returned: `GET /caregivers` (search results), `GET /caregivers/:id` (public profile), `GET /caregiver/profile` (self). It's **computed on every read** from `experienceYears`, `ratingAverage`/`ratingCount`, and completed-visit count — never stored, so it's always fresh and there's nothing to invalidate.

Thresholds (informational, not something the frontend needs to replicate):

| Badge | Experience | Rating | Completed visits |
|---|---|---|---|
| PLATINUM | ≥5 yrs | ≥4.5 (≥20 reviews) | ≥100 |
| GOLD | ≥3 yrs | ≥4.0 (≥10 reviews) | ≥50 |
| SILVER | ≥1 yr | ≥3.5 (≥1 review) | ≥10 |
| BRONZE | everyone else | | |

Render as a small badge/chip next to the caregiver's name on search cards and the profile header; sort/filter by it client-side if needed (the search endpoint doesn't take a badge filter param).

## 11. Operations

- **Migrations**: `20261028150000_feature_set_schema`, `20261028150100_seed_doctor_commission_rate`. Run `npx prisma migrate deploy` as usual; no manual data fixes needed (the second migration seeds the `DOCTOR` commission rate row itself).
- **New platform config keys** (`GET/PUT /admin/config/:key`, same as existing ones): `booking.immediateRespondWindowMinutes` (10), `booking.immediateMaxDistanceMeters` (5000), `caregiver.strikeThreshold` (3), `visit.lateArrivalGraceMinutes` (15).
- **New env var** (not admin-tunable, read once at boot like `RETENTION_INTERVAL_MINUTES`): `BOOKING_EXPIRY_INTERVAL_MINUTES` (default 5) — how often the expiry sweep runs.
- No new frontend dependencies are required for calls — it's native `RTCPeerConnection` + the Socket.IO client you already use.
