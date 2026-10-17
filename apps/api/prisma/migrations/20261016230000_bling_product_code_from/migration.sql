-- Importação de produtos do Bling: só códigos a partir deste número.
ALTER TABLE "BlingConnection" ADD COLUMN "productCodeFrom" INTEGER NOT NULL DEFAULT 1500;
