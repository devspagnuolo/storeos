-- CreateTable
CREATE TABLE "LoyaltyConfig" (
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerReal" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "realPerPoint" DECIMAL(8,4) NOT NULL DEFAULT 0.05,
    "minRedeem" INTEGER NOT NULL DEFAULT 1,
    "silverFrom" INTEGER NOT NULL DEFAULT 500,
    "goldFrom" INTEGER NOT NULL DEFAULT 2000,
    "diamondFrom" INTEGER NOT NULL DEFAULT 5000,
    "silverPct" INTEGER NOT NULL DEFAULT 100,
    "goldPct" INTEGER NOT NULL DEFAULT 100,
    "diamondPct" INTEGER NOT NULL DEFAULT 100,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("storeId")
);

-- AddForeignKey
ALTER TABLE "LoyaltyConfig" ADD CONSTRAINT "LoyaltyConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

