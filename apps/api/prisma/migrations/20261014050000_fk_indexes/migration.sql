-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_storeId_createdAt_idx" ON "Product"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX IF NOT EXISTS "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX IF NOT EXISTS "Address_customerId_idx" ON "Address"("customerId");
CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX IF NOT EXISTS "OrderTimeline_orderId_createdAt_idx" ON "OrderTimeline"("orderId", "createdAt");
