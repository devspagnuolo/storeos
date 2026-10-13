-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'AWAITING_PAYMENT', 'PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED');

CREATE TABLE "Store" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL,
  "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Role" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "name" TEXT NOT NULL, "description" TEXT, CONSTRAINT "Role_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Permission" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "key" TEXT NOT NULL, "description" TEXT, CONSTRAINT "Permission_pkey" PRIMARY KEY ("id"));
CREATE TABLE "UserRole" ("userId" TEXT NOT NULL, "roleId" TEXT NOT NULL, CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId"));
CREATE TABLE "RolePermission" ("roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL, CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId"));
CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL,
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT', "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "sku" TEXT NOT NULL, "description" TEXT, "price" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "productId" TEXT NOT NULL, "sku" TEXT NOT NULL,
  "price" DECIMAL(14,2), "attributes" JSONB NOT NULL, CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL, "alt" TEXT, "position" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Inventory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "variantId" TEXT, "quantity" INTEGER NOT NULL DEFAULT 0, "reserved" INTEGER NOT NULL DEFAULT 0,
  "reorderPoint" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL, "email" TEXT NOT NULL,
  "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Address" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "customerId" TEXT NOT NULL, "zipCode" TEXT NOT NULL,
  "street" TEXT NOT NULL, "number" TEXT NOT NULL, "city" TEXT NOT NULL, "state" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'BR', CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL, "customerId" TEXT,
  "number" TEXT NOT NULL, "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
  "subtotal" DECIMAL(14,2) NOT NULL, "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "shipping" DECIMAL(14,2) NOT NULL DEFAULT 0, "total" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "orderId" TEXT NOT NULL, "productId" TEXT,
  "sku" TEXT NOT NULL, "name" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL, "total" DECIMAL(14,2) NOT NULL, CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "orderId" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "transactionId" TEXT, "amount" DECIMAL(14,2) NOT NULL, CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderTimeline" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL, "message" TEXT, "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OrderTimeline_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "storeId" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL, "aggregateId" TEXT NOT NULL, "eventName" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE UNIQUE INDEX "User_storeId_email_key" ON "User"("storeId","email");
CREATE INDEX "User_storeId_idx" ON "User"("storeId");
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId","slug");
CREATE UNIQUE INDEX "Product_storeId_sku_key" ON "Product"("storeId","sku");
CREATE INDEX "Product_storeId_status_idx" ON "Product"("storeId","status");
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId","sku");
CREATE UNIQUE INDEX "Inventory_storeId_productId_variantId_key" ON "Inventory"("storeId","productId","variantId");
CREATE UNIQUE INDEX "Customer_storeId_email_key" ON "Customer"("storeId","email");
CREATE UNIQUE INDEX "Order_storeId_number_key" ON "Order"("storeId","number");
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId","status","createdAt");
CREATE INDEX "OutboxEvent_publishedAt_occurredAt_idx" ON "OutboxEvent"("publishedAt","occurredAt");
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderTimeline" ADD CONSTRAINT "OrderTimeline_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
