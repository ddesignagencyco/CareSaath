-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "priority" "IncidentPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "assignedAdminId" TEXT,
ADD COLUMN     "compensationAmount" INTEGER;

-- CreateIndex
CREATE INDEX "Dispute_assignedAdminId_idx" ON "Dispute"("assignedAdminId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
