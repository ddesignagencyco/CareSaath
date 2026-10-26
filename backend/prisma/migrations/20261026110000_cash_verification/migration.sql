-- Two-sided cash verification
ALTER TABLE "Payment" ADD COLUMN "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN "caregiverConfirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmationNote" TEXT;

-- Cash already settled before this change counts as confirmed by both sides
UPDATE "Payment" SET "customerConfirmedAt" = "paidAt", "caregiverConfirmedAt" = "paidAt"
WHERE "method" = 'CASH' AND "status" = 'PAID' AND "paidAt" IS NOT NULL;
