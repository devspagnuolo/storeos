warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Inventory" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderTimeline" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OutboxEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Permission" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProductImage" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProductVariant" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

