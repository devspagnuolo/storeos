-- Artigos do blog usam a mesma tabela das páginas institucionais (aditivo).
CREATE TYPE "PageKind" AS ENUM ('PAGE', 'POST');

ALTER TABLE "Page" ADD COLUMN "kind" "PageKind" NOT NULL DEFAULT 'PAGE',
ADD COLUMN "excerpt" TEXT,
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "authorName" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "Page" SET "publishedAt" = "updatedAt" WHERE "published" = true;

CREATE INDEX "Page_storeId_kind_published_publishedAt_idx" ON "Page"("storeId", "kind", "published", "publishedAt");
