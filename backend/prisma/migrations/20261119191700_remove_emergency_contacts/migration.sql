-- DropForeignKey
ALTER TABLE "EmergencyContact" DROP CONSTRAINT IF EXISTS "EmergencyContact_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "EmergencyContact";
