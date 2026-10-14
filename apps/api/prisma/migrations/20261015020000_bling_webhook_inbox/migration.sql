CREATE TYPE "BlingWebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "BlingWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'v1',
  "remoteId" TEXT NOT NULL,
  "orderNumber" TEXT,
  "payload" JSONB NOT NULL,
  "status" "BlingWebhookStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlingWebhookEvent_eventId_key" ON "BlingWebhookEvent"("eventId");
CREATE INDEX "BlingWebhookEvent_status_nextAttemptAt_receivedAt_idx" ON "BlingWebhookEvent"("status", "nextAttemptAt", "receivedAt");
CREATE INDEX "BlingWebhookEvent_companyId_receivedAt_idx" ON "BlingWebhookEvent"("companyId", "receivedAt");
