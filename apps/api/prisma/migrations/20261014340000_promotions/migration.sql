-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT_OFF', 'BUY_X_PAY_Y', 'CART_PERCENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "promotionDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "promotions" JSONB;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "buyQty" INTEGER,
    "payQty" INTEGER,
    "minSubtotal" DECIMAL(14,2),
    "skus" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_storeId_active_idx" ON "Promotion"("storeId", "active");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
