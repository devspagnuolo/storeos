ALTER TABLE "BlingConnection"
ADD COLUMN "automaticInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "BlingInvoiceStatus" AS ENUM ('QUEUED', 'PROCESSING', 'GENERATED', 'AUTHORIZED', 'REJECTED', 'FAILED');

CREATE TABLE "BlingInvoice" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "status" "BlingInvoiceStatus" NOT NULL DEFAULT 'QUEUED',
  "blingInvoiceId" TEXT,
  "invoiceNumber" TEXT,
  "series" TEXT,
  "accessKey" TEXT,
  "danfeUrl" TEXT,
  "xmlUrl" TEXT,
  "rejectionReason" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedAt" TIMESTAMP(3),
  "authorizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlingInvoice_orderId_key" ON "BlingInvoice"("orderId");
CREATE UNIQUE INDEX "BlingInvoice_blingInvoiceId_key" ON "BlingInvoice"("blingInvoiceId");
CREATE INDEX "BlingInvoice_storeId_status_nextAttemptAt_idx" ON "BlingInvoice"("storeId", "status", "nextAttemptAt");
CREATE INDEX "BlingInvoice_storeId_invoiceNumber_idx" ON "BlingInvoice"("storeId", "invoiceNumber");

ALTER TABLE "BlingInvoice" ADD CONSTRAINT "BlingInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlingInvoice" ADD CONSTRAINT "BlingInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlingInvoice" ADD CONSTRAINT "BlingInvoice_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BlingConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlingInvoice" ADD COLUMN "submittedAt" TIMESTAMP(3);
