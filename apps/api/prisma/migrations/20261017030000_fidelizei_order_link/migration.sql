-- Reserva do Fidelizei ligada ao pedido (link-order): prazo de 48 horas em vez de 20 minutos.
ALTER TABLE "FidelizeiRedemption" ADD COLUMN "orderLinkedAt" TIMESTAMP(3);
