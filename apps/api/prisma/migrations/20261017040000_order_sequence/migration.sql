-- Numeração sequencial de pedidos por loja (00001, 00002…). Pedidos antigos mantêm o número que já têm.
ALTER TABLE "Store" ADD COLUMN "orderSequence" INTEGER NOT NULL DEFAULT 0;
