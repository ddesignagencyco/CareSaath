-- CreateEnum
CREATE TYPE "StrikeReason" AS ENUM ('DECLINED', 'LATE_ARRIVAL', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'CONNECTED', 'ENDED', 'MISSED', 'REJECTED');

-- AlterEnum
-- Postgres forbids using a newly-added enum value inside the transaction that
-- added it, so the DOCTOR CommissionRate seed row lives in the next migration.
ALTER TYPE "Specialty" ADD VALUE 'DOCTOR';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "isImmediate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CaregiverProfile" ADD COLUMN     "currentLat" DECIMAL(9,6),
ADD COLUMN     "currentLng" DECIMAL(9,6),
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "maxRatePerVisit" INTEGER,
ADD COLUMN     "minRatePerVisit" INTEGER,
ADD COLUMN     "strikeCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalOrder" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "diagnosis" TEXT,
    "medicines" JSONB NOT NULL DEFAULT '[]',
    "labTests" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaregiverStrike" (
    "id" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "bookingId" TEXT,
    "reason" "StrikeReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverStrike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'INITIATED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_bookingId_createdAt_idx" ON "ChatMessage"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalOrder_visitId_idx" ON "MedicalOrder"("visitId");

-- CreateIndex
CREATE INDEX "MedicalOrder_patientId_idx" ON "MedicalOrder"("patientId");

-- CreateIndex
CREATE INDEX "CaregiverStrike_caregiverId_createdAt_idx" ON "CaregiverStrike"("caregiverId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_visitId_idx" ON "CallLog"("visitId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "CaregiverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverStrike" ADD CONSTRAINT "CaregiverStrike_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "CaregiverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverStrike" ADD CONSTRAINT "CaregiverStrike_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
