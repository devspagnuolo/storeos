ALTER TABLE "Store"
  ADD COLUMN "draftThemeConfig" JSONB,
  ADD COLUMN "storefrontVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "storefrontPublishedAt" TIMESTAMP(3);

CREATE TABLE "StorefrontPublication" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config" JSONB NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorefrontPublication_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StorefrontPublication_storeId_version_key" ON "StorefrontPublication"("storeId", "version");
CREATE INDEX "StorefrontPublication_storeId_createdAt_idx" ON "StorefrontPublication"("storeId", "createdAt");
