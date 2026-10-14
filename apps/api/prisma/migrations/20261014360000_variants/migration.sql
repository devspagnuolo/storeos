-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "variantId" TEXT;
