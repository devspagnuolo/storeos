-- AlterTable
ALTER TABLE "Product" ADD COLUMN "weightGrams" INTEGER,
ADD COLUMN "widthCm" INTEGER,
ADD COLUMN "heightCm" INTEGER,
ADD COLUMN "lengthCm" INTEGER;

-- AlterTable
ALTER TABLE "ShippingRule" ADD COLUMN "freeOnly" BOOLEAN NOT NULL DEFAULT false;
