-- CreateEnum
CREATE TYPE "FidelizeiRedemptionStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "FidelizeiConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "termsVersion" TEXT NOT NULL DEFAULT '2026-10',
    "privacyVersion" TEXT NOT NULL DEFAULT '2026-10',
    "termsUrl" TEXT,
    "privacyUrl" TEXT,
    "eventsCursor" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FidelizeiConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FidelizeiMember" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fidelizeiCustomerId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FidelizeiMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FidelizeiRedemption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "redemptionId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardName" TEXT NOT NULL,
    "pointsDebited" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minimumOrderCents" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2),
    "status" "FidelizeiRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FidelizeiRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FidelizeiConnection_storeId_key" ON "FidelizeiConnection"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "FidelizeiMember_customerId_key" ON "FidelizeiMember"("customerId");

-- CreateIndex
CREATE INDEX "FidelizeiMember_storeId_idx" ON "FidelizeiMember"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "FidelizeiRedemption_orderId_key" ON "FidelizeiRedemption"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FidelizeiRedemption_redemptionId_key" ON "FidelizeiRedemption"("redemptionId");

-- CreateIndex
CREATE UNIQUE INDEX "FidelizeiRedemption_checkoutId_key" ON "FidelizeiRedemption"("checkoutId");

-- CreateIndex
CREATE INDEX "FidelizeiRedemption_storeId_status_idx" ON "FidelizeiRedemption"("storeId", "status");

-- CreateIndex
CREATE INDEX "FidelizeiRedemption_customerId_idx" ON "FidelizeiRedemption"("customerId");

-- AddForeignKey
ALTER TABLE "FidelizeiConnection" ADD CONSTRAINT "FidelizeiConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FidelizeiMember" ADD CONSTRAINT "FidelizeiMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FidelizeiMember" ADD CONSTRAINT "FidelizeiMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FidelizeiRedemption" ADD CONSTRAINT "FidelizeiRedemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FidelizeiRedemption" ADD CONSTRAINT "FidelizeiRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FidelizeiRedemption" ADD CONSTRAINT "FidelizeiRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

