-- Pedido pago baixado no Bling: estoque e contas lançados e situação "Atendido".
ALTER TABLE "BlingOrderSync" ADD COLUMN "postedAt" TIMESTAMP(3);
ALTER TABLE "BlingOrderSync" ADD COLUMN "postError" TEXT;
-- Pedidos que já estavam no Bling foram tratados lá à mão: não lançar de novo.
UPDATE "BlingOrderSync" SET "postedAt" = NOW();
