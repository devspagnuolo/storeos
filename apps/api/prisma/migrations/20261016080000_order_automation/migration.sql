-- CreateEnum
CREATE TYPE "ShippingLabelStatus" AS ENUM ('PENDING', 'CREATED', 'PAID', 'RELEASED', 'DELIVERED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingOptionId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "orderAutomation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingSender" JSONB;

-- CreateTable
CREATE TABLE "ShippingLabel" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'superfrete',
    "serviceId" TEXT NOT NULL,
    "remoteId" TEXT,
    "status" "ShippingLabelStatus" NOT NULL DEFAULT 'PENDING',
    "remoteStatus" TEXT,
    "trackingCode" TEXT,
    "labelUrl" TEXT,
    "price" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingLabel_orderId_key" ON "ShippingLabel"("orderId");

-- CreateIndex
CREATE INDEX "ShippingLabel_status_nextAttemptAt_idx" ON "ShippingLabel"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "ShippingLabel" ADD CONSTRAINT "ShippingLabel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingLabel" ADD CONSTRAINT "ShippingLabel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


