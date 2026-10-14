-- Prazo de pagamento (libera a reserva de estoque ao expirar) e data de confirmação.
ALTER TABLE "Payment" ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE INDEX "Payment_provider_transactionId_idx" ON "Payment"("provider", "transactionId");
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
