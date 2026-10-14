-- AlterTable
ALTER TABLE "Category" ADD COLUMN "bannerUrl" TEXT,
ADD COLUMN "bannerMobileUrl" TEXT;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "name" TEXT,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_storeId_createdAt_idx" ON "MediaAsset"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
