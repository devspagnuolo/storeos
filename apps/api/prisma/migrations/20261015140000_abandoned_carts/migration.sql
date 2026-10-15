-- CreateEnum
CREATE TYPE "AbandonedCartStatus" AS ENUM ('OPEN', 'REMINDED', 'RECOVERED', 'OPTED_OUT');

-- CreateTable
CREATE TABLE "AbandonedCart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "items" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "token" TEXT NOT NULL,
    "status" "AbandonedCartStatus" NOT NULL DEFAULT 'OPEN',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "recoveredOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbandonedCart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCart_token_key" ON "AbandonedCart"("token");

-- CreateIndex
CREATE INDEX "AbandonedCart_storeId_status_lastActivityAt_idx" ON "AbandonedCart"("storeId", "status", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCart_storeId_email_key" ON "AbandonedCart"("storeId", "email");

-- AddForeignKey
ALTER TABLE "AbandonedCart" ADD CONSTRAINT "AbandonedCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

