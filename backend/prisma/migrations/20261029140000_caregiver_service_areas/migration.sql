-- CreateTable
CREATE TABLE "CaregiverServiceArea" (
    "id" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "label" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaregiverServiceArea_caregiverId_idx" ON "CaregiverServiceArea"("caregiverId");

-- CreateIndex
CREATE INDEX "CaregiverServiceArea_city_idx" ON "CaregiverServiceArea"("city");

-- AddForeignKey
ALTER TABLE "CaregiverServiceArea" ADD CONSTRAINT "CaregiverServiceArea_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "CaregiverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
