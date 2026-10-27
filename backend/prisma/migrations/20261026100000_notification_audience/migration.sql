-- Role-scoped, titled notifications
ALTER TABLE "Notification" ADD COLUMN "title" TEXT,
ADD COLUMN "body" TEXT,
ADD COLUMN "audienceRole" "UserRole";

-- Existing rows belong to the recipient's current role
UPDATE "Notification" n SET "audienceRole" = u."role" FROM "User" u WHERE n."userId" = u."id";

CREATE INDEX "Notification_userId_audienceRole_channel_readAt_idx" ON "Notification"("userId", "audienceRole", "channel", "readAt");
