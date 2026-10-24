-- Fundo padrão das fotos de produto (desligado até o lojista escolher) e a foto original de cada foto com o fundo trocado.
ALTER TABLE "Store" ADD COLUMN "photoBackground" JSONB;

CREATE TABLE "PhotoOriginal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoOriginal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhotoOriginal_url_key" ON "PhotoOriginal"("url");
CREATE INDEX "PhotoOriginal_storeId_idx" ON "PhotoOriginal"("storeId");
ALTER TABLE "PhotoOriginal" ADD CONSTRAINT "PhotoOriginal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
