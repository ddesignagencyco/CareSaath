-- Seed the platform admin (prod had no ADMIN user). Idempotent and safe:
--  * if the number already exists, promote it to ADMIN;
--  * otherwise create it — but only if neither the phone nor the email is taken,
--    so the migration can never hit a unique-constraint error.
UPDATE "User"
SET role = 'ADMIN', "fullName" = 'Umair Shad', "updatedAt" = now()
WHERE phone = '+923062224502';

INSERT INTO "User" (id, phone, email, role, "fullName", "updatedAt")
SELECT gen_random_uuid(), '+923062224502', 'caresaath@gmail.com', 'ADMIN', 'Umair Shad', now()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE phone = '+923062224502')
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'caresaath@gmail.com');
