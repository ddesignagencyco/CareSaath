-- Payout resolution details shown back to the caregiver
ALTER TABLE "PayoutRequest" ADD COLUMN "note" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- Notification read state
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);

-- SOS device location
ALTER TABLE "SafetyIncident" ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6);
