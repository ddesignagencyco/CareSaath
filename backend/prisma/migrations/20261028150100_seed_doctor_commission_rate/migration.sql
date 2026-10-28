-- Doctor caregiver profiles are a new Specialty value; caregiver registration
-- and profile updates look up a CommissionRate row by specialty and 404 if
-- none exists, so production needs this row to exist without relying on the
-- dev-only seed script (which refuses to run when NODE_ENV=production).
INSERT INTO "CommissionRate" ("id", "category", "percentage", "effectiveFrom", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'DOCTOR', 20.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
