CREATE TYPE "LoyaltyEntryType" AS ENUM ('EARN', 'REVERSAL', 'REDEEM', 'ADJUST');

CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "LoyaltyEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyEntry_orderId_type_key" ON "LoyaltyEntry"("orderId", "type");
CREATE INDEX "LoyaltyEntry_storeId_customerId_createdAt_idx" ON "LoyaltyEntry"("storeId", "customerId", "createdAt");

ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
