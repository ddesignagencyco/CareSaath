-- Set the platform admin's email to the requested caresaath@gmail.com. The admin
-- number already existed with a different email, so this corrects it. Guarded so it
-- can never hit the email unique constraint: only applied when no OTHER user already
-- holds that email.
UPDATE "User"
SET email = 'caresaath@gmail.com', "updatedAt" = now()
WHERE phone = '+923062224502'
  AND role = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'caresaath@gmail.com' AND phone <> '+923062224502');
