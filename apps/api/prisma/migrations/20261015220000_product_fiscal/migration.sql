-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "gtin" TEXT,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "taxOrigin" INTEGER,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "gtin" TEXT;

