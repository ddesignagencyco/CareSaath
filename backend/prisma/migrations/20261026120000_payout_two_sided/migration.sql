-- Admin transfers, the caregiver confirms receipt
ALTER TYPE "PayoutStatus" ADD VALUE 'TRANSFERRED' BEFORE 'PAID';

ALTER TABLE "PayoutRequest" ADD COLUMN "transferredAt" TIMESTAMP(3),
ADD COLUMN "transferReference" TEXT,
ADD COLUMN "caregiverConfirmedAt" TIMESTAMP(3),
ADD COLUMN "issueReportedAt" TIMESTAMP(3),
ADD COLUMN "issueNote" TEXT;
