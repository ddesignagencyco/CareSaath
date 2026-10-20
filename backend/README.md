# CareSaath Backend

NestJS API for **CareSaath**, a home nursing and physiotherapy marketplace for
Pakistan (1–2 pilot cities). One API serves three clients: the customer app, the
caregiver panel and the admin panel. See the [root README](../Readme.md) for the
project-wide overview and [docs/](../docs) for requirements, data model and
architecture.

> This file is the working reference for the backend. It is written to be useful
> to both humans and AI agents: conventions, module map, API surface and gotchas
> are documented here so changes stay consistent.

---

## Overview

CareSaath connects patients/families with **verified** caregivers (nurses,
physiotherapists, post-surgery and elderly-care attendants). Core flows:

1. **Identity** — phone + OTP login, JWT access/refresh, role guards
   (CUSTOMER, CAREGIVER, ADMIN).
2. **Onboarding** — caregivers register, upload credentials to MinIO, and are
   approved by an admin before appearing in search.
3. **Booking → visit** — customers book single/recurring visits; caregivers
   accept/decline; each visit walks a state machine
   `REQUESTED → CONFIRMED → EN_ROUTE → CHECKED_IN → IN_PROGRESS → CHECKED_OUT → COMPLETED`
   with GPS/OTP check-in, notes and reviews.
4. **Money** — cash-on-visit and digital payments (gateway webhook, idempotent),
   per-category commission, caregiver earnings and admin payout approval.
5. **Trust & safety** — reviews, safety incidents with admin triage, disputes,
   and an append-only audit trail.

### Status

Phases 0–8 are complete (auth, users/patients, caregiver onboarding, bookings +
visit lifecycle, payments/payouts/commissions, admin promos/disputes/safety/
analytics/reports). Remaining hardening is tracked in the root README and TRD.

---

## Tech stack

| Layer | Choice |
|---|---|
| Language / runtime | TypeScript, Node.js 24+, ESM (`"type": "module"`) |
| Framework | NestJS 12 (REST) |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`), client generated into `src/generated/prisma` |
| Database | PostgreSQL |
| Cache / OTP store | Redis (ioredis) |
| Object storage | MinIO (S3-compatible) |
| API docs | Swagger at `/docs`, OpenAPI JSON at `/docs-json` |
| Validation | `class-validator` + `class-transformer` |
| Lint / format | oxlint (`--type-aware`) + Prettier |
| Tests | Vitest (unit `*.spec.ts`, e2e `*.e2e-spec.ts`) |

---

## Getting started

Prerequisites: Node.js 24+, npm, Docker. Services (Postgres, Redis, MinIO,
MailHog) are defined in [`../docker/docker-compose.yml`](../docker/docker-compose.yml).

```bash
# from the repository root
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d

# then, in backend/
npm install
npx prisma migrate deploy      # or: npx prisma migrate dev
npm run seed                   # admin user + commission rates
npm run start:dev
```

Configuration is read from `../.env` (repo root), then `.env`
(`ConfigModule.forRoot({ envFilePath: ['../.env', '.env'] })`). Never commit
`.env`.

Startup logs print the API base (`/api/v1`), Swagger UI and OpenAPI JSON URLs.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run in watch mode |
| `npm run build` | Compile to `dist/` (nest build) |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | `oxlint --type-aware src/ test/` |
| `npm run format` | Prettier over `src/` and `test/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | End-to-end tests (requires Docker services) |
| `npm run seed` | Seed admin + commission rates |

**Definition of done for a change:** `npm run lint`, `npm run build`, `npm test`
and `npm run test:e2e` all pass. Always run these before committing.

---

## Source layout

```
src/
  main.ts                 Bootstrap: global prefix, ValidationPipe, exception filter, CORS, Swagger
  app.module.ts           Root module: config, infra modules, feature modules, global guards
  common/                 Cross-cutting building blocks (see below)
  generated/prisma/       Generated Prisma client — do not edit by hand
  <feature>/              Feature modules, each self-contained (see module map)
test/
  test-helpers.ts         vi.fn() Prisma/audit/storage/notifications mocks + wireTransaction
  e2e-helpers.ts          createTestApp(), signAccessToken(), bearer(), uniquePhone()
  *.e2e-spec.ts           End-to-end suites
prisma/
  schema.prisma           Data model (source of truth)
  migrations/             SQL migrations
  seed.mjs                Seed script
```

### `common/`

| Path | Role |
|---|---|
| `common/prisma/prisma.service.ts` | `PrismaService` (global) |
| `common/redis/redis.module.ts` | `RedisService` (global) |
| `common/storage/storage.module.ts` | `StorageService.put/presignedGet/validateUpload` (global, MinIO) |
| `common/audit/audit.module.ts` | `AuditService.log(...)` append-only audit (global); never throws into request path |
| `common/guards/jwt-auth.guard.ts` | Global JWT guard; bypassed by `@Public()` |
| `common/guards/roles.guard.ts` | Global role guard driven by `@Roles(...)` |
| `common/decorators/current-user.decorator.ts` | `@CurrentUser()` → `AuthUser { sub, role, phone }` |
| `common/decorators/public.decorator.ts` | `@Public()` to skip JWT auth |
| `common/decorators/roles.decorator.ts` | `@Roles('CUSTOMER' \| 'CAREGIVER' \| 'ADMIN')` |
| `common/dto/pagination.ts` | `PaginationDto`, `Paginated<T>`, `paginate()` |
| `common/filters/http-exception.filter.ts` | Consistent JSON error envelope |

Global guards are registered in `app.module.ts` via `APP_GUARD`:
`JwtAuthGuard` then `RolesGuard`. Every route is authenticated unless marked
`@Public()`.

---

## Module map

Each feature lives in a single `<feature>.module.ts` file that bundles its DTOs,
service and controllers, following the existing modules. The Prisma client's
generated enums/types are imported from `../generated/prisma/client.js`.

| Module | Path prefix(es) | Responsibility |
|---|---|---|
| auth | `/auth` | Phone + OTP login, JWT access/refresh, current user |
| users | `/customer` | Profile + emergency contacts |
| patients | `/customer/patients` | Patient profiles (FR-C2) |
| addresses | `/customer/addresses` | Saved addresses with lat/lng |
| caregivers | `/caregiver`, `/caregivers` | Register, profile, photo, public search/profile |
| availability | `/caregiver/availability` | Weekly rules + date blocks |
| verification | `/admin/caregivers` | Verification queue: approve/reject/suspend/etc. |
| bookings | `/customer/bookings`, `/caregiver/bookings` | Create (incl. recurring + promo), accept/decline/cancel, reschedule, prescription upload/view (FR-C5, FR-C13) |
| visits | `/caregiver/visits`, `/customer/visits` | Visit state machine, GPS/OTP check-in (FR-CG7), check-out, notes |
| notifications | `/notifications` | Persist + dispatch status-change notifications |
| feedback | `/customer/visits/:id/review`, safety reports, `/sos` | Reviews (FR-C12), safety reports, SOS incident (FR-C14) |
| payments | `/customer/payments`, `/caregiver/payments`, `/payments/webhook` | Cash + gateway payments, idempotent webhook |
| payouts | `/caregiver/payout-accounts`, `/caregiver/earnings`, `/caregiver/payouts`, `/admin/payouts` | Payout accounts, earnings, payout requests + approval |
| commissions | `/admin/commissions` | Per-category commission config (FR-A4) |
| promos | `/admin/promos` | Promo codes + discount calculation (FR-A8) |
| disputes | `/disputes`, `/admin/disputes` | Raise + admin mediation (FR-A7) |
| admin | `/admin/analytics`, `/admin/reports/export`, `/admin/safety-incidents` | Analytics (FR-A5), CSV reports (FR-A9), incident triage (FR-A6) |

### Route groups at a glance

```
/health
/auth                        phone OTP, refresh
/customer/...                me, emergency-contacts, patients, addresses, bookings, payments, visits
/caregiver/...               register, profile, photo, availability, bookings, visits, payments, payout-accounts, earnings, payouts, safety-reports
/caregivers                  public search + profile
/disputes                    raise / list own (customer + caregiver)
/sos                         raise an SOS during an active visit (customer + caregiver)
/notifications               own notifications
/admin/caregivers            verification + management
/admin/commissions           GET/PUT commission rates
/admin/promos                GET/POST/PATCH promo codes
/admin/payouts               GET + approve/mark-paid/reject
/admin/disputes              GET + resolve
/admin/safety-incidents      GET + PATCH
/admin/analytics             platform metrics
/admin/reports/export        CSV reports
/payments/webhook/:provider  public gateway callback
```

---

## Domain rules worth knowing

- **Commission** is configured per `Specialty` and captured on the payment row at
  payment time (`splitCommission`), so later rate changes don't rewrite history.
- **Amounts** are integer minor units (paisa).
- **Visit lifecycle** transitions are enforced only in `visits.module.ts`
  (`ALLOWED_TRANSITIONS` / `canTransition`); every accepted transition writes a
  `VisitStatusHistory` row and notifies the customer.
- **Payments**: cash starts `PENDING` and settles when the assigned caregiver
  confirms receipt; digital methods return a `gatewayRef` and settle via the
  public webhook. The webhook is **idempotent** — replays never move a payment
  out of a terminal state.
- **Payout earnings** = paid payments with no payout request; requesting a payout
  attaches settled payments to it; rejecting a payout releases them back.
- **Payout account numbers** are encrypted (AES-256-GCM via
  `PAYOUT_ENCRYPTION_KEY`) and only ever returned masked (`****1234`). The same
  utility encrypts caregiver CNIC (`CNIC_ENCRYPTION_KEY`) and patient medical
  context (`MEDICAL_ENCRYPTION_KEY`); reads decrypt transparently and legacy
  plaintext rows still read correctly.
- **Visit check-in** accepts GPS coordinates or an OTP issued to the
  *customer's* phone; the OTP is hashed in Redis + `OtpCode` and consumed on use.
- **Promo discounts** are clamped to the base amount; redeeming a code increments
  `usesCount`.
- **Caregivers** only appear in search once `verificationStatus = APPROVED`.

---

## Conventions

- **Module-per-feature**: DTO + service + controllers in one `<feature>.module.ts`
  unless a module grows large. DTOs use `class-validator` decorators +
  `@ApiProperty`/`@ApiPropertyOptional`.
- **Auth**: annotate controllers/services with `@Roles(...)`; use `@Public()` for
  unauthenticated routes; read the caller via `@CurrentUser()`.
- **Pagination**: reuse `PaginationDto`/`paginate`; numeric query params need
  `@Type(() => Number)` when a default value is set (otherwise the global
  `ValidationPipe` with `forbidNonWhitelisted` rejects them).
- **Audit**: call `AuditService.log({ actorId, action, entityType, entityId, metadata })`
  for state-changing actions.
- **Notifications**: `NotificationsService.notify(...)` never throws into the
  request path — safe to call after the business write.
- **ESM imports** use the `.js` extension (e.g. `./foo.module.js`) because the
  project is ESM with `isolatedModules`.
- **Prisma JSON filters**: use snake_case operators, e.g.
  `serviceArea: { path: ['cities'], array_contains: [city] }`.
- **Errors**: throw Nest HTTP exceptions (`BadRequestException`,
  `NotFoundException`, …); `AllExceptionsFilter` shapes the response.
- No comments unless they explain non-obvious intent; no secrets in code.

---

## Testing

- **Unit** (`*.spec.ts`, beside the module): services constructed directly with
  mocks from `test/test-helpers.ts` (`createPrismaMock`, `createAuditMock`,
  `createNotificationsMock`, `createStorageMock`, `wireTransaction`). When a
  service gains a new Prisma model, add it to `createPrismaMock`.
- **E2E** (`test/*.e2e-spec.ts`): boot the full app via `createTestApp()` against
  the real Docker Postgres/Redis/MinIO, sign tokens with `signAccessToken`, and
  clean up created rows in `afterAll` (watch FK order: incidents → payments →
  visits → bookings → profiles → users).

Suites currently cover: health, auth, caregiver onboarding/verification,
booking → visit lifecycle, payments & payouts, admin promos/disputes/analytics/
reports/safety, and customer/caregiver self-service.

---

## Database

- Schema: `prisma/schema.prisma` (models for identity, caregivers, bookings,
  visits, payments/payouts, safety, disputes, notifications, audit).
- Migrations: `prisma/migrations/`.
- Change workflow: edit schema → `npx prisma migrate dev --name <change>` →
  regenerate client → update seeds/tests.
- Seed (`npm run seed`): an admin user (`ADMIN_PHONE`) and commission rates for
  every `Specialty` (default 20%).

---

## Documentation

- [Root README](../Readme.md): project overview, status, local ports
- [SRS](../docs/Caresaath-SRS.md): functional requirements (FR-C/CG/A)
- [ERD](../docs/CARESAATH_ERD.md): data model per entity
- [TRD](../docs/CARESAATH_TRD.md): architecture, module/API design, security, infrastructure

Swagger UI (`/docs`) is the authoritative reference for request/response shapes.
