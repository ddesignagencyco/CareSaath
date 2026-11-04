-- Platform config: every specialty needs a commission rate before a caregiver
-- can register (otherwise registration fails with "Commission rate not configured
-- for this specialty"). This seeds the default rate for any specialty that does
-- not already have one. Idempotent (ON CONFLICT DO NOTHING) — safe on every
-- deploy and on databases that are already seeded.
INSERT INTO "CommissionRate" (id, category, percentage, "effectiveFrom", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'NURSING', 20, now(), now(), now()),
  (gen_random_uuid(), 'PHYSIOTHERAPY', 20, now(), now(), now()),
  (gen_random_uuid(), 'POST_SURGERY_CARE', 20, now(), now(), now()),
  (gen_random_uuid(), 'ELDERLY_CARE', 20, now(), now(), now()),
  (gen_random_uuid(), 'DOCTOR', 20, now(), now(), now())
ON CONFLICT (category) DO NOTHING;
