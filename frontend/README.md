# CareSaath Web

One Next.js 16 project (App Router, Tailwind v4, TanStack Query) serving all three
sections of CareSaath as routes. Talks to the NestJS API (`/api/v1`) — always the real backend.

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3001
```

`.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1` (the local backend). The app always
talks to the real API; the production build reads `.env.production` (the Render API URL).

| URL | Section |
|---|---|
| `/` | Start page linking to the sections |
| `/admin` | Operations console (`/admin/login`) |
| `/caregiver` | Caregiver panel, phone-first (`/caregiver/login`) |
| `/customer` | Customer app, phone-first (`/customer/login`) |

**Sign-in:** in dev the OTP is printed in the backend console and emailed to MailHog
(`http://localhost:18025`, `info@caresaath.com`). Seed numbers: admin +92 300 0000000;
customers +92 300 1110001 / 1110002; caregivers +92 300 1110011 / 1110012 / 1110013 (approved),
1110014 (pending); doctors +92 300 1110021 / 1110022. Promo codes: `WELCOME10`, `ELDERCARE500`.

## Layout

```
src/
  app/
    layout.tsx, globals.css, page.tsx     root (fonts, providers, start page)
    admin/      login/, (console)/…       admin routes
    caregiver/  login/, (setup)/…, (app)/… caregiver routes
    customer/   login/, (app)/…           customer routes
  features/
    admin/      components/, lib/ (api)
    caregiver/  components/, lib/ (api, helpers)
    customer/   components/, lib/ (api, labels)
  shared/       design system (@shared/*): ui/, auth/, api/, lib/, styles/theme.css, types
```

Each section has its own session key, so you can be signed in to admin and caregiver at once.

## Conventions

- Never use a native `<select>`; use `Select` / `MultiSelect` from `@shared/ui/select` (react-select).
- Phone numbers are Pakistani mobiles only: validate with `parsePkMobile` (`@shared/lib/phone`).
- Documents, licenses and prescriptions open only in the in-app `FileViewer` (no new tabs or download links).
- Query keys are namespaced per section (`a-`, `cg-`, `c-`) because all sections share one React Query cache.
- Brand tokens live in `src/shared/styles/theme.css`.

## Languages (English / Urdu)

All three sections (admin, caregiver, customer) are bilingual English / Urdu.

- next-intl, client-only. `LocaleProvider` (`src/shared/i18n/provider.tsx`) keeps one locale per section in localStorage (`caresaath.admin.locale`, `caresaath.customer.locale`, `caresaath.caregiver.locale`) and sets `<html lang dir>`; Urdu is RTL.
- Messages live in `src/shared/i18n/messages/{en,ur}/*.json`, one namespace per area (common, labels, shared, apiErrors, adminA/B, caregiverA/B, customerA/B). Keys are type-checked; EN and UR must have the same keys.
- Formatting: `useFmt()` for money, dates, times, weekdays and ages; `useLabels()` for every enum label; `useApiErrorText()` maps known backend error messages to Urdu.
- RTL: use logical Tailwind classes only (`ms/me/ps/pe/start/end/text-start`); directional icons get `rtl:-scale-x-100`; phone numbers, OTP, amounts, CNIC and times are isolated LTR; user-written text uses `dir="auto"`.
- Font: all Urdu text is Gulzar (Google Fonts, a web Nastaliq; Latin and digits stay in Plus Jakarta), with taller line heights, no letter-spacing, and `font-synthesis-weight` disabled (Gulzar is single-weight).
- The language toggle in the top bar, the login screen, the caregiver profile and the customer account page saves `preferredLanguage` to the profile when signed in.

## Loader

`shared/ui/brand-loader.tsx`: the logo's two heart strokes draw up from the bottom point and meet at the top, the heads pop in, one heartbeat, loop (keyframes `.cs-loader-*` in theme.css; static under reduced motion). Used by the first-load splash (`shared/app/splash.tsx`, in the root layout), `app/loading.tsx`, and the customer/caregiver shell placeholders.

## Tests

Vitest + React Testing Library (jsdom), set up per the Next.js guide.

```bash
npm test           # watch mode
npm run test:run   # single run (~30 s, 500+ tests)
```

- Config: `vitest.config.mts` (API layer runs in real mode against a fake base URL; fetch is always mocked; TZ Asia/Karachi). Helpers: `src/test/utils.tsx` (`renderWithProviders`, `mockFetch`, `json`, `apiPath`, `fakeJwt`).
- Coverage: shared HTTP client (refresh, errors), phone/money/date formatting, translation files (en/ur parity, valid ICU, matching placeholders), shared UI components, and per section an API contract test for every route (method, path, exact body/query) plus helpers and key page flows.
- Tests live next to the module (`*.test.ts`) or in `src/features/<section>/__tests__/`.

### Live flow test (needs the running backend)

`npm run test:e2e` runs a full production-shaped journey across all three roles
(register → approve → book → visit lifecycle → cash → payout → disputes/safety)
through the frontend's own API functions against the real backend. It creates
fresh test users (seeded demo data untouched) and prints a pass/fail line per
API. Requires the backend on :3000 and its Docker services up. The cash path is
covered; gateway webhook settlement needs real providers (see docs/requirement.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

## Backend wiring

- One API function per backend route in `src/features/<section>/lib/api/*.ts`; each calls the real API through the shared `http` client.
- `src/shared/api/http.ts`: JSON + multipart, Nest error parsing, network errors, and automatic access-token refresh on 401 (single flight, safe across tabs). A failed refresh clears the session and the shell returns to that section's login.
- Every backend gap found while wiring (missing routes/fields, wrong status codes, security issues) is listed with suggested fixes in **`docs/requirement.md`**. Frontend switches to flip once the backend is fixed are noted there (e.g. `CAN_DEACTIVATE_CAREGIVER`).
