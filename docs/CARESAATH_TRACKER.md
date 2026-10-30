|**CareSaath — Dev Tracker**||
| - | :- |
|||
|**Source**||
|**Companion docs**||
|**Sheets**||
|**Cells you edit**||
|**Status values**||
|**Priority**||
|**Phases**||
|**Estimates / dates**||
|**Frontend note**||



||
| - |
||
|CareSaath SRS (Sep 23, 2026). Tasks are derived from SRS requirements; nothing is invented. Unknowns are marked TBD (see Open Questions sheet).|
|CARESAATH\_ERD.md, CARESAATH\_TRD.md|
|Summary (auto-counts) · Backend · Frontend · Open Questions|
|Owner, Status, Start, Due, Notes (blue text). Status uses a dropdown. Everything else is pre-filled from the SRS.|
|Not Started · In Progress · In Review · Blocked · Done|
|High = needed for a working MVP flow or required by SRS constraints. Medium/Low = can follow. Priority is a proposal; adjust freely.|
|P0 Setup · P1 Core (auth, onboarding, verification) · P2 Booking & Visits · P3 Payments · P4 Safety & Admin · P5 Hardening|
|Not filled in. Effort estimates need team size and decisions in Open Questions (TBD).|
|Customer-app framework and caregiver panel (web vs native) are undecided in the SRS; see Open Questions #1 and #2.|


|**Progress Summary**||||
| - | - | - | - |
|||||
|**Status**|**Backend**|**Frontend**|**Total**|
|Not Started|3|48|51|
|In Progress|0|0|0|
|In Review|0|0|0|
|Blocked|0|0|0|
|Done|64|0|64|
|**Total tasks**|**67**|**48**|**115**|
|**% Done**|**95.5%**|**0.0%**|**55.7%**|
|||||
|**Tasks by phase**||||
|**Phase**|**Total**|**Done**|**% Done**|
|P0 Setup|12|7|58\.3%|
|P1 Core|24|15|62\.5%|
|P2 Booking & Visits|31|17|54\.8%|
|P3 Payments|15|10|66\.7%|
|P4 Safety & Admin|20|10|50\.0%|
|P5 Hardening|13|5|38.5%|
|||||
|||||
|**Open questions still unresolved**|**31**|||

|**ID**|**Module**|**Task**|
| :-: | :-: | :-: |
|BE-001|Setup|Initialise NestJS + TypeScript project, npm scripts, lint/format|
|BE-002|Setup|Docker Compose: postgres, redis, backend|
|BE-003|Setup|Prisma setup, initial schema from ERD, migrations, seed script|
|BE-004|Setup|Config module + .env validation; tunable-values table|
|BE-005|Setup|Global validation, exception filter, logging, pagination, Swagger|
|BE-006|Setup|Storage service wrapper (Cloudinary upload, signed URL, in-memory fallback)|
|BE-007|Setup|CI pipeline (install, lint, type-check, test, build)|
|BE-008|Auth|OTP request endpoint (generate, hash, store in Redis, send SMS)|
|BE-009|Auth|OTP verify endpoint, issue JWT access + refresh|
|BE-010|Auth|Refresh/logout, token deny-list in Redis|
|BE-011|Auth|Role guards (Customer/Caregiver/Admin) + ownership checks|
|BE-012|Auth|OTP/login rate limiting|
|BE-013|Auth|Admin login method|
|BE-014|Users|User CRUD, language preference (EN/UR), status handling|
|BE-015|Patients|Patient profile CRUD (self / family member, medical context)|
|BE-016|Addresses|Address CRUD with lat/lng|
|BE-017|Caregiver|Caregiver registration (name, CNIC, license no.)|
|BE-018|Caregiver|Certificate/license document upload to Cloudinary|
|BE-019|Caregiver|Profile: specialty, service area, rate per visit|
|BE-020|Caregiver|Public caregiver profile endpoint (quals, license no., experience, ratings, rate)|
|BE-021|Verification|Admin queue + approve/reject endpoints, block unapproved from search|
|BE-022|Verification|Periodic re-verification due dates + reminders|
|BE-023|Availability|Weekly availability rules CRUD|
|BE-024|Availability|Blocked dates CRUD|
|BE-025|Search|Caregiver search by specialty, location, availability|
|BE-026|Search|DB indexes + Redis caching to meet <3s on 3G|
|BE-027|Booking|Create single booking (date, time window, address, patient)|
|BE-028|Booking|Recurring booking: generate one visit per occurrence|
|BE-029|Booking|Double-booking prevention (transactional availability check)|
|BE-030|Booking|Prescription/care-plan upload with booking|
|BE-031|Booking|Caregiver accept/decline within response window|
|BE-032|Booking|Customer cancel/reschedule within notice window|
|BE-033|Visits|Visit state machine (Requested → … → Completed) + history table|
|BE-034|Visits|En-route endpoint|
|BE-035|Visits|Check-in/check-out via GPS or OTP, store coordinates|
|BE-036|Visits|Visit note submit (moves to Completed) + customer view|
|BE-037|Visits|Caregiver view of patient context + prescription (secured access)|
|BE-038|Notifications|Notification service + event triggers on status change|
|BE-039|Notifications|SMS integration|
|BE-040|Notifications|WhatsApp Business API integration + templates|
|BE-041|Notifications|Push notification integration|
|BE-042|Reviews|Rating + review after completed visit; update caregiver rating|
|BE-043|Payments|Payment records + cash-on-visit flow|
|BE-044|Payments|JazzCash integration + signed idempotent webhook|
|BE-045|Payments|Easypaisa integration + webhook|
|BE-046|Payments|Card gateway integration + webhook|



|BE-047|Payments|Raast integration|
| - | - | - |
|BE-048|Commissions|Commission rate config per category + calculation at payment|
|BE-049|Payouts|Earnings summary endpoint|
|BE-050|Payouts|Payout account + payout request to bank/wallet|
|BE-051|Promos|Promo code CRUD + apply at booking|
|BE-052|Safety|Safety complaint tied to visit (customer)|
|BE-053|Safety|Caregiver safety/access report|
|BE-054|Safety|SOS endpoint: alert admin + emergency contact|
|BE-055|Safety|Incident management: priority escalation + audit trail|
|BE-056|Disputes|Dispute create/mediate/resolve endpoints|
|BE-057|Admin|Suspend/deactivate caregiver|
|BE-058|Admin|Analytics endpoint (bookings, revenue, active caregivers, cancellation rate)|
|BE-059|Admin|CSV/Excel export of financial and operational reports|
|BE-060|Audit|Audit log service (credential approvals, check-in/out, incidents)|
|BE-061|Security|Field-level encryption (CNIC, medical context, payout accounts)|
|BE-062|Security|TLS + at-rest encryption config for Postgres/Cloudinary|
|BE-063|Quality|Unit tests: state machine, commission, availability, OTP|
|BE-064|Quality|E2E tests: login, booking→completion, webhooks, doc access control|
|BE-065|Quality|Search performance test under throttled 3G|
|BE-066|Quality|Idempotency/retry handling for booking, payment, check-in|
|BE-067|Ops|Backups, health checks, monitoring for 99.5% uptime|



|**SRS Ref**|**Phase**|**Priority**|**Owner**|**Status**|**Start**|
| :-: | :-: | :-: | :-: | :-: | :-: |
|TRD §3.3|P0 Setup|High||Done||
|TRD §10.1|P0 Setup|High||Done||
|ERD|P0 Setup|High||Done||
|TRD §4|P0 Setup|High||Done||
|TRD §5|P0 Setup|Medium||Done||
|TRD §7|P0 Setup|High||Done||
|TRD §10.4|P0 Setup|Medium||Done||
|FR-C1|P1 Core|High||Done||
|FR-C1|P1 Core|High||Done||
|TRD §5.1|P1 Core|Medium||Done||
|SRS §2.3|P1 Core|High||Done||
|TRD §7|P1 Core|High||Done||
|SRS §8.1|P1 Core|Medium||Done||
|SRS §2.5|P1 Core|Medium||Done||
|FR-C2|P1 Core|High||Done||
|FR-C7|P1 Core|High||Done||
|FR-CG1|P1 Core|High||Done||
|FR-CG1|P1 Core|High||Done||
|FR-CG3|P1 Core|High||Done||
|FR-C4|P1 Core|High||Done||
|FR-CG2, FR-A1|P1 Core|High||Done||
|FR-A2|P4 Safety & Admin|Medium||Done||
|FR-CG4|P2 Booking & Visits|High||Done||
|FR-CG4|P2 Booking & Visits|High||Done||
|FR-C3|P2 Booking & Visits|High||Done||
|SRS §6|P2 Booking & Visits|High||Done||
|FR-C6, FR-C7|P2 Booking & Visits|High||Done||
|FR-C6|P2 Booking & Visits|High||Done||
|FR-CG4|P2 Booking & Visits|High||Done||
|FR-C5|P2 Booking & Visits|High||Done||
|FR-CG5|P2 Booking & Visits|High||Done||
|FR-C13|P2 Booking & Visits|High||Done||
|FR-C9, SRS §8.2|P2 Booking & Visits|High||Done||
|FR-C9|P2 Booking & Visits|Medium||Done||
|FR-CG7|P2 Booking & Visits|High||Done||
|FR-CG8, FR-C11|P2 Booking & Visits|High||Done||
|FR-CG6|P2 Booking & Visits|High||Done||
|FR-C10|P2 Booking & Visits|High||Done||
|FR-C10, SRS §7.3|P2 Booking & Visits|High||Done||
|FR-C10, SRS §7.3|P3 Payments|Medium||Done||
|FR-C10|P3 Payments|Medium||Done||
|FR-C12|P3 Payments|Medium||Done||
|FR-C8|P3 Payments|High||Done||
|FR-C8, SRS §7.2|P3 Payments|High||Done||
|FR-C8, SRS §7.2|P3 Payments|High||Done||
|FR-C8, SRS §7.2|P3 Payments|High||Done||


|SRS §7.2|P3 Payments|Low||Not Started||
| - | - | - | - | - | - |
|FR-A4|P3 Payments|High||Done||
|FR-CG9|P3 Payments|Medium||Done||
|FR-CG9|P3 Payments|Medium||Done||
|FR-A8|P4 Safety & Admin|Low||Done||
|FR-C14|P4 Safety & Admin|High||Done||
|FR-CG10|P4 Safety & Admin|High||Done||
|SRS §9.2|P4 Safety & Admin|High||Done||
|FR-A6|P4 Safety & Admin|High||Done||
|FR-A7|P4 Safety & Admin|Medium||Done||
|FR-A3|P4 Safety & Admin|High||Done||
|FR-A5|P4 Safety & Admin|Medium||Done||
|FR-A9|P4 Safety & Admin|Medium||Done||
|SRS §6|P1 Core|High||Done||
|SRS §6|P5 Hardening|High||Done||
|SRS §6|P5 Hardening|High||Not Started||
|TRD §11|P5 Hardening|High||Done||
|TRD §11|P5 Hardening|High||Done||
|SRS §6|P5 Hardening|Medium||Done||
|SRS §6|P5 Hardening|High||Done||
|SRS §6|P5 Hardening|Medium||Not Started||


|**Due**|**Notes**|
| :-: | :-: |
|||
||Version pins TBD|
|||
||Holds TBD windows/limits|
|||
|||
||CI tool TBD|
||SMS vendor TBD|
||TTLs TBD|
|||
|||
||Limits TBD|
||TBD: SRS silent|
|||
||Fields TBD; encrypt|
|||
||Encrypt CNIC|
|||
||Service-area model TBD|
|||
||No unverified profile goes live|
||Interval TBD (annual example)|
|||
|||
|||
||Target definition TBD|
|||
||Allowed patterns TBD|
||Design|
||File rules TBD|
||Window + timeout behaviour TBD|
||Window TBD; Cancelled state is a gap-fill|
|||
||Trigger (manual vs auto) TBD|
||GPS radius TBD|
|||
||Only assigned caregiver + admin|
|||
||Vendor TBD|
||Provider/approval TBD|
||Provider TBD|
||Scale TBD|
||Cash settlement TBD|
||Merchant docs needed|
||Merchant docs needed|
||Vendor TBD|



||Usage TBD|
| - | - |
||Rates TBD|
|||
||Approval flow TBD; encrypt accounts|
||Platform-wide discount scope TBD|
|||
|||
||Recipient TBD|
||Priority levels TBD|
||Workflow TBD|
|||
|||
|||
||Wire in as modules are built|
||Key management TBD|
||Hosting TBD|
|||
|||
||p95 2.1 s on Slow 3G (budget 3 s)|
||No data loss on drop|
||Hosting TBD|


|**ID**|**Module**|**Task**|
| :-: | :-: | :-: |
|FE-001|Setup|Next.js + TypeScript project, lint, folder structure|
|FE-002|Setup|Customer app framework decision and project setup|
|FE-003|Setup|i18n setup (English/Urdu) with RTL support|
|FE-004|Setup|Typed API client from OpenAPI + auth/token handling|
|FE-005|Setup|Design system: tokens, components, large-text mode|
|FE-006|Shared|Language switcher in settings|
|FE-007|Customer|Phone + OTP login screens|
|FE-008|Customer|Patient profile create/edit (self or family)|
|FE-009|Customer|Saved addresses + map pin picker|
|FE-010|Customer|Caregiver search + filters (specialty, location, availability)|
|FE-011|Customer|Caregiver profile screen (quals, license no., experience, ratings, rate)|
|FE-012|Customer|Booking flow: single or recurring, date, time window, address|
|FE-013|Customer|Prescription/care-plan upload in booking|
|FE-014|Customer|Visit status tracking screen|
|FE-015|Customer|Caregiver identity + photo shown before visit|
|FE-016|Customer|Cancel/reschedule UI|
|FE-017|Customer|View caregiver visit notes|
|FE-018|Customer|Push/notification handling|
|FE-019|Customer|Payment screens (cash, card, JazzCash, Easypaisa)|
|FE-020|Customer|Rating and review screen|
|FE-021|Customer|Safety complaint form tied to a visit|
|FE-022|Customer|SOS button during active visit|
|FE-023|Customer|Large-text / simple-navigation option|
|FE-024|Caregiver|Registration form (name, CNIC, license, certificate upload)|
|FE-025|Caregiver|Verification status screen (pending/approved/rejected)|
|FE-026|Caregiver|Profile: specialty, service area, rate|
|FE-027|Caregiver|Weekly availability + blocked dates|
|FE-028|Caregiver|Incoming requests list with accept/decline + countdown|
|FE-029|Caregiver|Visit detail: patient context + prescription viewer|
|FE-030|Caregiver|En-route / check-in / check-out (GPS or OTP)|
|FE-031|Caregiver|Visit note form|
|FE-032|Caregiver|Earnings view + payout request + payout account|
|FE-033|Caregiver|Safety/access issue report|
|FE-034|Admin|Admin login + layout/navigation|
|FE-035|Admin|Caregiver verification queue: view documents, approve/reject|
|FE-036|Admin|Suspend/deactivate caregiver|
|FE-037|Admin|Re-verification list/reminders|
|FE-038|Admin|Commission rate settings|
|FE-039|Admin|Safety incident console with priority and audit trail|
|FE-040|Admin|Dispute mediation screens|
|FE-041|Admin|Promo code management|
|FE-042|Admin|Analytics dashboard|
|FE-043|Admin|Report export (CSV/Excel)|
|FE-044|Quality|Responsive checks: Chrome, Edge, Safari|
|FE-045|Quality|Android 8+ / iOS 13+ device checks|
|FE-046|Quality|Urdu/English UI review|



|FE-047|Quality|Usability test: first-time / elderly-assisting user in 2 minutes|
| - | - | - |
|FE-048|Quality|Offline/network-drop handling for check-in, notes, booking|



|**SRS Ref**|**Phase**|**Priority**|**Surface**|**Owner**|
| :-: | :-: | :-: | :-: | :-: |
|TRD §3.3|P0 Setup|High|Admin / Caregiver (Next.js)||
|SRS §7.1|P0 Setup|High|Customer||
|SRS §2.5, §6|P0 Setup|High|Shared||
|TRD §9|P0 Setup|High|Shared||
|SRS §7.1|P0 Setup|Medium|Shared||
|SRS §6|P1 Core|Medium|Shared||
|FR-C1|P1 Core|High|Customer||
|FR-C2|P1 Core|High|Customer||
|FR-C7|P1 Core|High|Customer||
|FR-C3|P2 Booking & Visits|High|Customer||
|FR-C4|P2 Booking & Visits|High|Customer||
|FR-C6, FR-C7|P2 Booking & Visits|High|Customer||
|FR-C5|P2 Booking & Visits|High|Customer||
|FR-C9|P2 Booking & Visits|High|Customer||
|SRS §9.2|P2 Booking & Visits|High|Customer||
|FR-C13|P2 Booking & Visits|High|Customer||
|FR-C11|P2 Booking & Visits|Medium|Customer||
|FR-C10|P2 Booking & Visits|Medium|Customer||
|FR-C8|P3 Payments|High|Customer||
|FR-C12|P3 Payments|Medium|Customer||
|FR-C14|P4 Safety & Admin|High|Customer||
|SRS §9.2|P4 Safety & Admin|High|Customer||
|SRS §7.1|P5 Hardening|Medium|Customer||
|FR-CG1|P1 Core|High|Caregiver||
|FR-CG2|P1 Core|High|Caregiver||
|FR-CG3|P1 Core|High|Caregiver||
|FR-CG4|P2 Booking & Visits|High|Caregiver||
|FR-CG5|P2 Booking & Visits|High|Caregiver||
|FR-CG6|P2 Booking & Visits|High|Caregiver||
|FR-CG7|P2 Booking & Visits|High|Caregiver||
|FR-CG8|P2 Booking & Visits|High|Caregiver||
|FR-CG9|P3 Payments|Medium|Caregiver||
|FR-CG10|P4 Safety & Admin|High|Caregiver||
|SRS §7.1|P1 Core|High|Admin||
|FR-A1|P1 Core|High|Admin||
|FR-A3|P4 Safety & Admin|High|Admin||
|FR-A2|P4 Safety & Admin|Medium|Admin||
|FR-A4|P3 Payments|High|Admin||
|FR-A6|P4 Safety & Admin|High|Admin||
|FR-A7|P4 Safety & Admin|Medium|Admin||
|FR-A8|P4 Safety & Admin|Low|Admin||
|FR-A5|P4 Safety & Admin|Medium|Admin||
|FR-A9|P4 Safety & Admin|Medium|Admin||
|SRS §7.6|P5 Hardening|Medium|Shared||
|SRS §7.6|P5 Hardening|Medium|Customer||
|SRS §6|P5 Hardening|Medium|Shared||


|SRS §6|P5 Hardening|Medium|Shared||
| - | - | - | - | - |
|SRS §6|P5 Hardening|Medium|Shared||


|**Status**|**Start**|**Due**|**Notes**|
| :-: | :-: | :-: | :-: |
|Not Started|||Admin + caregiver (if web)|
|Not Started|||TBD: native vs other|
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started|||Fields TBD|
|Not Started|||Maps provider TBD|
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started|||Window TBD|
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started|||Login method TBD|
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||
|Not Started||||


|Not Started||||
| - | - | - | - |
|Not Started|||Behaviour TBD|


|**#**|**Open question (TBD)**|
| :-: | :-: |
|1|Caregiver panel: web (SRS §2.4) or native app (SRS §7.1)?|
|2|Mobile framework for customer app (stack has Next.js only)|
|3|Pilot cities (1–2) and service-area model|
|4|Fields inside 'basic medical context' (FR-C2)|
|5|Specialty list: elderly care and attendant appear in some places only|
|6|Cancellation/reschedule notice window (FR-C13)|
|7|Caregiver response window and timeout behaviour (FR-CG5)|
|8|Cancelled state missing from SRS §8.2 lifecycle|
|9|Who triggers 'En Route' (caregiver or automatic)|
|10|GPS radius / OTP flow for check-in|
|11|Payment per visit vs per booking; refund rules|
|12|Cash-on-visit commission settlement|
|13|Raast usage (payments, payouts, or both)|
|14|Commission percentages per category|
|15|Payout approval flow and timing|
|16|Gateway merchant docs and credentials (JazzCash, Easypaisa, card)|
|17|SMS, WhatsApp, push providers|
|18|Maps provider|
|19|Whose emergency contact receives SOS alert|
|20|Incident priority levels and escalation SLAs|
|21|Dispute workflow and who may raise one|
|22|Admin login method|
|23|OTP expiry, max attempts, rate limits; JWT lifetimes|
|24|PNC/PMDC cross-check: manual or semi-automated; physio body name|
|25|Re-verification interval (SRS example: annual)|
|26|Data protection obligations, retention period, key management|
|27|Hosting provider, CI tool, monitoring|
|28|SRS §8.1 shows caregiver viewing analytics but FR-A5 is admin only|
|29|Rating scale and review moderation|
|30|Recurring-schedule patterns allowed|
|31|Promo code types; platform-wide discount scope|



|**Affects**|**Suggested decider**|**Decision**|
| :-: | :-: | :-: |
|Frontend scope, staffing|Product||
|Customer app delivery|Tech lead||
|Search design, seeding|Product||
|Patient table, forms|Product / Compliance||
|Enums, search filters|Product||
|Rules, UI|Product||
|Booking flow|Product||
|State machine|Product||
|Visit flow|Product||
|Check-in rules|Product||
|Payments schema|Product / Finance||
|Finance design|Finance||
|Payment integration|Finance||
|Config|Business||
|Payouts|Finance||
|Payment work blocked|Business||
|Notifications|Tech lead||
|Address pin, search|Tech lead||
|Safety flow|Product / Compliance||
|Safety flow|Product||
|Disputes|Product||
|Auth|Tech lead||
|Auth|Tech lead||
|Verification|Compliance||
|Verification|Compliance||
|Security|Compliance||
|Infra, uptime|Tech lead||
|Scope|Product||
|Reviews|Product||
|Booking|Product||
|Promos|Business||


|**Status**|
| :-: |
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|
|Open|

