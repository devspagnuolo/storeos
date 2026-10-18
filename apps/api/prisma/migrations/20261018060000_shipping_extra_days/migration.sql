-- Dias somados ao prazo da transportadora na cotação
ALTER TABLE "Store" ADD COLUMN "shippingExtraDays" INTEGER NOT NULL DEFAULT 0;
