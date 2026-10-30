-- Caregiver registration and profile updates look up a CommissionRate row by
-- specialty and fail with 404 when none exists. The dev seed script creates
-- these rows, but it refuses to run when NODE_ENV=production, so production
-- needs every specialty seeded by a migration. Idempotent: safe to re-run.
INSERT INTO "CommissionRate" ("id", "category", "percentage", "effectiveFrom", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'NURSING',           20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PHYSIOTHERAPY',     20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'POST_SURGERY_CARE', 20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ELDERLY_CARE',      20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DOCTOR',            20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
