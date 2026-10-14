-- Regras de frete por UF e o método escolhido em cada pedido.
CREATE TABLE "ShippingRule" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "states" TEXT[], "price" DECIMAL(14,2) NOT NULL, "freeAbove" DECIMAL(14,2),
  "minDays" INTEGER NOT NULL, "maxDays" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShippingRule_storeId_active_position_idx" ON "ShippingRule"("storeId", "active", "position");
ALTER TABLE "ShippingRule" ADD CONSTRAINT "ShippingRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "shippingMethod" TEXT;
