-- CreateEnum
CREATE TYPE "BlingSyncStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BlingImportStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "document" TEXT;

-- CreateTable
CREATE TABLE "BlingConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlingOrderSync" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "BlingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "blingOrderId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlingOrderSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlingImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "BlingImportStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BlingImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlingConnection_storeId_key" ON "BlingConnection"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "BlingOrderSync_orderId_key" ON "BlingOrderSync"("orderId");

-- CreateIndex
CREATE INDEX "BlingOrderSync_storeId_status_idx" ON "BlingOrderSync"("storeId", "status");

-- CreateIndex
CREATE INDEX "BlingImport_storeId_startedAt_idx" ON "BlingImport"("storeId", "startedAt");

-- AddForeignKey
ALTER TABLE "BlingConnection" ADD CONSTRAINT "BlingConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlingOrderSync" ADD CONSTRAINT "BlingOrderSync_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlingOrderSync" ADD CONSTRAINT "BlingOrderSync_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlingImport" ADD CONSTRAINT "BlingImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
