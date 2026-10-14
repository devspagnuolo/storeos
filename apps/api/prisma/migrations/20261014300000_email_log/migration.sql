CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'SIMULATED', 'FAILED');

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "eventId" TEXT,
    "template" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_storeId_createdAt_idx" ON "EmailLog"("storeId", "createdAt");

ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
