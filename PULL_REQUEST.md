# Pull Request: Platform Enhancements, Auth Concurrency Fixes, Cloudinary Profile Photos & Mobile-Responsive Email Templates

## Summary

This PR bundles comprehensive platform enhancements, security hardening, and reliability improvements across seven key workstreams:
1. **Fully mobile-responsive transactional email templates** eliminating horizontal scrolling on phones.
2. **Cloudinary-backed profile photos & pre-upload crop modal** across all roles (customer, caregiver, admin).
3. **Auth & token refresh stability fix** adding a 30-second Refresh Token Rotation (RTR) grace period in Redis to eliminate automatic logout and multi-tab race conditions.
4. **Meta WhatsApp Cloud API integration** for OTP verification and automated visit notifications.
5. **API access-key gate** for HTTP routes and Socket.IO handshakes with branded fallback pages.
6. **Live visit ETA and tracking improvements** with clinical typed inputs and text-wrapped prescription PDF rendering.
7. **Caregiver dashboard & visits UX upgrades** including emergency availability toggle, live visit beacon, and permanent filter bars.

---

## Commits Included

| Commit | Description |
| --- | --- |
| `ba60bbf` | `fix(email)`: make email templates mobile responsive without horizontal scrolling |
| `90dfec0` | `feat`: profile photos with crop modal across all roles & token refresh race condition fix |
| `4041a61` | `chore(env)`: add Firebase storage, sender, and measurement keys to web example |
| `0d0fb22` | `chore(env)`: group env examples by type and document missing variables |
| `a6e327c` | `chore`: remove personal phone number from WhatsApp tests and comments |
| `455a9d6` | `feat(caregiver-ui)`: add available-now emergency toggle, live visit beacon, permanent visit filters bar, and mobile nav labels |
| `bca6802` | `fix(prescription)`: wrap text in pdf & add clinical typed inputs to doctor orders; fix ws throttler & live eta decay |
| `e452d12` | `feat`: integrate Meta WhatsApp Cloud API for OTP and notifications |
| `7aee166` | Merge of `feat-frontend` remote changes |
| `f999088` | `feat(api)`: match access-key sign-in page to CareSaath status page design |
| `1e6b50a` | `feat(web)`: send API access key on HTTP and Socket.IO requests |
| `5dfcbfb` | `feat(api)`: restyle access-key sign-in page with CareSaath copy |
| `e2c343d` | `feat(api)`: add optional `API_ACCESS_KEY` gate for HTTP and Socket.IO |

---

## Changes by Area

### 1. Mobile-Responsive Email Templates (`backend/src/email/`)
- **Zero Horizontal Scrolling**: Replaced rigid desktop-only padding with fluid `table-layout: fixed; width: 100%; max-width: 560px;` and responsive media queries (`@media only screen and (max-width: 600px)`).
- **Adaptive Padding**: Mobile wrapper padding scales down to `20px 10px 32px`, and card padding drops from `36px 32px` to `24px 16px 20px` to maximize readable space on small devices.
- **Responsive OTP Code**: Code font size scales down from `28px` (desktop) to `24px` with tighter letter-spacing (`5px`) on mobile, guaranteeing a seamless fit on 320px screens.
- **Text & Facts Table Wrapping**: Added `overflow-wrap: anywhere` and `word-break: break-word` on fact table values, preventing long UUIDs or timestamps from forcing column blowout.
- **Client Normalization**: Added `<meta name="x-apple-disable-message-reformatting">` to prevent iOS Mail auto-zooming, alongside MSO conditional containers for Outlook desktop compatibility.

### 2. Profile Photos & Universal Avatars (`backend` & `frontend`)
- **Database Schema**: Added `photoKey String?` to the Prisma `User` model (`backend/prisma/schema.prisma`) and applied migration `20261117100000_user_photo`.
- **Backend API Routes**:
  - Added `POST /customer/me/photo` (Cloudinary upload via `StorageService`), `DELETE /customer/me/photo`, and `GET /customer/me/photo/url`.
  - Added public `GET /customer/:userId/photo` route (302 redirect to Cloudinary) so avatars can load without requiring Authorization headers.
  - Caregiver photo uploads dual-write to both `CaregiverProfile.photoKey` and `User.photoKey` in an atomic transaction.
- **Frontend UI & Pre-upload Crop Modal**:
  - `PhotoCropModal` component (`shared/ui/photo-crop-modal.tsx`): canvas-based image editor with drag/pan, zoom slider (1×–3×), 90° clockwise rotation, reset, circular avatar mask, and 512×512 JPEG export.
  - `PhotoPicker` component (`shared/ui/photo-picker.tsx`): camera icon upload button with file validation, crop trigger, and remove action.
  - `UserAvatar` component (`shared/ui/user-avatar.tsx`): fetches photo via user ID and gracefully falls back to initials on 404 or image error.
  - Integrated across customer, caregiver, and admin views (bookings, visits, chat, header shells, and admin console).

### 3. Auth, Session & Refresh Token Stability (`backend/src/auth/` & `frontend/src/shared/api/`)
- **Redis Rotation Grace Period**:
  - Implemented a 30-second token rotation grace window (`jwt:rotated:<refreshToken>`) in `backend/src/auth/auth.service.ts`.
  - Concurrent requests or rapid retries presenting a recently rotated refresh token receive the cached active token pair instead of triggering `401 Refresh token already used`.
  - Explicitly removes rotated token cache on user logout.
- **Frontend HTTP Client Concurrency Lock**:
  - Lifted the in-flight refresh promise in `frontend/src/shared/api/http.ts` to module scope (`sharedRefreshing`) so caregiver, customer, admin, call-context, and `bootstrapSession` all share a single deduplicated refresh call.
  - Transient network drops (`!res`) no longer wipe the session; `store.clear()` is only called on explicit 400/401/403 HTTP rejections.
- **Realtime WebSocket Handling**:
  - Updated Socket.IO lifecycle in `shared/api/realtime.ts` to await token refresh on `auth.expired` and `auth.error` before attempting reconnection.

### 4. WhatsApp Cloud API Integration (`backend/src/whatsapp/`)
- New `WhatsAppService` + `WhatsAppModule` (`backend/src/whatsapp/`): E.164 phone normalization, template OTP delivery, free-text messaging, and config gating.
- `SmsService` and notification channels automatically route OTP and visit alerts over WhatsApp when configured, falling back to local `[DEV-SMS]` logging otherwise.
- Zero-dependency manual runner `backend/test-whatsapp-otp.mjs` reading strictly from `WHATSAPP_TEST_RECIPIENT`.

### 5. API Access-Key Gate (`backend/src/common/middleware/` & `frontend`)
- `api-access-key.ts` middleware: optional security gate enabled when `API_ACCESS_KEY` is present.
- Applies to both HTTP endpoints and Socket.IO handshakes.
- Branded access key sign-in page matching CareSaath's status page theme; frontend automatically transmits key on HTTP headers and WebSocket queries.

### 6. Live Visit ETA & Tracking (`backend` & `frontend`)
- `effectiveEta` prevents fallback estimates from decaying to zero; live fixes decay at most 1 minute between updates.
- Added `splitEta` for day/hour/minute rendering and customer visit panel indicators (**Live** vs **Estimated**).
- `useVisitLocationStream` is reference-counted so `AppShell` and visit pages share a single 12-second GPS polling interval.
- Prescription PDF: layout text wrapping and structured clinical inputs (diagnosis, medication/lab instructions with autocomplete datalists) in doctor orders.

### 7. Caregiver UX Improvements (`frontend/src/features/caregiver/`)
- "Available now" emergency toggle on caregiver dashboard.
- Active visit beacon with live pulsing badge and patient address.
- Visits page permanent filter bar (All / Upcoming / Past with count badges) and date filtering.
- Mobile navigation label truncation with English and Urdu localization.

---

## Testing & Verification

- **Backend Unit Tests**: `npm test` → **54 passed (54 test files, 528 tests)**
- **Frontend Unit Tests**: `npm run test:run` → **36 passed (36 test files, 534 tests)**
- **TypeScript Typecheck**:
  - Backend: `npx tsc --noEmit` → **0 errors**
  - Frontend: `npx tsc --noEmit` → **0 errors**
- **Production Builds**:
  - Backend: `npm run build` compiled successfully to `dist/`
  - Frontend: `npm run build` completed with all routes successfully generated
- **Database Status**: `npx prisma migrate status` → up to date (20 migrations applied)

---

## Configuration & Environment Notes

- Profile photos utilize Cloudinary via existing credentials in `.env` (`CLOUDINARY_CLOUD_NAME`).
- WhatsApp remains disabled by default (`WHATSAPP_ENABLED=false`) until credentials are provided.
- `API_ACCESS_KEY` is optional; leaving it unset keeps the API open as before.
