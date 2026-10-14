-- Persist company routing and both order identifiers returned by Bling.
ALTER TYPE "BlingSyncStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "BlingConnection"
  ADD COLUMN "companyId" TEXT;

CREATE INDEX "BlingConnection_companyId_idx" ON "BlingConnection"("companyId");

ALTER TABLE "BlingOrderSync"
  ADD COLUMN "blingOrderNumber" TEXT,
  ADD COLUMN "blingSituationId" TEXT,
  ADD COLUMN "blingSituationName" TEXT;

CREATE INDEX "BlingOrderSync_storeId_blingOrderId_idx" ON "BlingOrderSync"("storeId", "blingOrderId");
