## 🟡 Still open

1. **Web push — set VAPID keys on the backend.** `GET /notifications/push/public-key` returns `{ enabled:false, vapidPublicKey:null }` until the server has VAPID keys. The client subscribe flow silently no-ops until then; set the keys (and the subscribe/send path) so pushes actually deliver while the app is closed.
2. **Confirm `en-route` right after `accept`** — the caregiver accept auto-calls `POST /caregiver/visits/:id/en-route` for immediate bookings. Confirm there's no earliest-start-time guard that would 400 it for a now-booking (scheduled visits still start travel manually).

## Nice-to-have

- **`priorVisitsWithCaregiver` on `CaregiverBookingListItem`** (`GET /caregiver/bookings`) — if present, the caregiver request card's "returning customer" count uses it instead of the client-side estimate from the last 50 bookings.
