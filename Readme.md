# CareSaath

Home nursing and physiotherapy marketplace for Pakistan (1–2 pilot cities). Customers book verified caregivers; admins verify caregivers and manage the platform. This repository holds the **backend** (one API serving the customer app, caregiver panel and admin panel).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Requirements and design docs (SRS, ERD, TRD, tracker) | Done |
| 1 | Project setup: NestJS, Prisma, Docker services | Done |
| 2 | Database schema and migrations (from ERD) | Done |
| 3 | Auth: phone + OTP, JWT, role guards | Done |
| 4 | Users, patients, addresses, emergency contacts | Done |
| 5 | Caregiver onboarding, profile/edit/search, availability, document storage, admin verification | Done |
| 6 | Bookings + visit lifecycle, notifications, reviews, safety reports | Done |
| 7 | Payments (cash + gateway webhook), payouts, commission config | Done |
| 8 | Admin promos, disputes, safety triage, analytics, CSV reports | Done |
| 9 | Gap-fill: OTP visit check-in, prescription upload, visit reschedule, SOS, CNIC/medical-context encryption | Done |
| 10 | Hardening: platform config (admin-tunable), notification channels (SMS/WhatsApp/push), search caching, data retention job, CI | Done |
| 11+ | Remaining: WhatsApp/push vendor integration, SMS gateway, hosting/CD, monitoring | Not started |

_Update this table as each phase progresses._

## Tech stack

| Layer | Choice |
|---|---|
| Language / runtime | TypeScript, Node.js |
| Framework | NestJS (REST API) |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Cache / OTP store | Redis |
| Object storage | MinIO (S3-compatible) |
| Dev email | MailHog |
| Containers | Docker Compose |
| Package manager | npm |

Open decisions (mobile framework, SMS/WhatsApp/payment vendors, hosting, CI/CD) are tracked in [docs/CARESAATH_TRD.md](docs/CARESAATH_TRD.md).

## Repository layout

```
backend/    NestJS app and Prisma schema
docker/     Docker Compose for local services
docs/       SRS, ERD, TRD, tracker
```

## Getting started

Prerequisites: Node.js 24+, npm, Docker.

```bash
# 1. Environment
cp .env.example .env

# 2. Start PostgreSQL, Redis, MinIO, MailHog
docker compose -f docker/docker-compose.yml up -d

# 3. Install and run the backend
cd backend
npm install
npm run start:dev
```

Local service ports:

| Service | Port |
|---|---|
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API / console | 9000 / 9001 |
| MailHog SMTP / web UI | 11025 / 18025 |

Credentials in `.env.example` are for local development only. Never commit `.env`.

## Scripts (from `backend/`)

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run the API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm test` | Unit tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | End-to-end tests |

Unit tests live beside their modules as `*.spec.ts` (services covered with mocked
Prisma/Redis/storage via `test/test-helpers.ts`). E2E tests require the Docker
services to be running and live in `test/*.e2e-spec.ts` (shared app bootstrap via
`test/e2e-helpers.ts`), covering auth, caregiver onboarding/verification,
booking -> visit lifecycle, notifications, reviews, payments/payouts, admin
promos/disputes/analytics, customer/caregiver self-service, and the phase-9
gap-fills (OTP check-in, prescription upload, reschedule, SOS, field encryption).

## Branching

- `main`: stable, reviewed code.
- `dev`: active development. Branch from here and merge back via pull request.

## Documentation

- [SRS](docs/Caresaath-SRS.md): software requirements
- [ERD](docs/CARESAATH_ERD.md): data model
- [TRD](docs/CARESAATH_TRD.md): architecture, modules, APIs, security, infrastructure
- [Tracker](docs/CARESAATH_TRACKER.xlsx): task tracking
