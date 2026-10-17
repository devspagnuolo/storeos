-- Marca de avanço da importação do Bling: permite encerrar uma importação que morreu com o servidor.
ALTER TABLE "BlingImport" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "BlingImport" SET "updatedAt" = "startedAt";
