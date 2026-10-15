-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

