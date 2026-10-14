CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "showInFooter" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Page_storeId_slug_key" ON "Page"("storeId", "slug");
CREATE INDEX "Page_storeId_published_position_idx" ON "Page"("storeId", "published", "position");

ALTER TABLE "Page" ADD CONSTRAINT "Page_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
