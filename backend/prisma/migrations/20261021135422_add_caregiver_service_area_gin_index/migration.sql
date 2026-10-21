-- CreateIndex
CREATE INDEX "CaregiverProfile_serviceArea_idx" ON "CaregiverProfile" USING GIN ("serviceArea" jsonb_path_ops);
