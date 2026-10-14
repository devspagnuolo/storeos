-- Categorias do catálogo e campos de pagamento/entrega para o checkout.
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CREDIT_CARD');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

CREATE TABLE "Category" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "description" TEXT, "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductCategory" (
  "productId" TEXT NOT NULL, "categoryId" TEXT NOT NULL,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

ALTER TABLE "Order" ADD COLUMN "shippingAddress" JSONB;
ALTER TABLE "Payment"
  ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'PIX',
  ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "instructions" JSONB,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");
CREATE INDEX "Category_storeId_position_idx" ON "Category"("storeId", "position");
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alinha as FKs ao schema Prisma: apagar cliente ou produto mantém o histórico do pedido.
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
