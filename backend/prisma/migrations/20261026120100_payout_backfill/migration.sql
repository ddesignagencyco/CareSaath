-- Payouts settled before the confirmation step count as confirmed
UPDATE "PayoutRequest" SET "transferredAt" = "processedAt", "caregiverConfirmedAt" = "processedAt"
WHERE "status" = 'PAID' AND "processedAt" IS NOT NULL;
