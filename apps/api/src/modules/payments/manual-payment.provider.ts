import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ChargeRequest, ChargeResult, PaymentProvider } from './payment-provider';

/**
 * Adaptador para desenvolvimento e operação assistida: registra a cobrança como pendente
 * e devolve instruções para a loja confirmar o pagamento manualmente.
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const transactionId = `manual_${randomUUID()}`;
    const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: request.currency }).format(Number(request.amount));
    const instructions: Record<string, string> = request.method === PaymentMethod.BOLETO
      ? { message: `O boleto do pedido ${request.orderNumber} será enviado para ${request.customer.email}.` }
      : { message: `Pague ${amount} via PIX informando o pedido ${request.orderNumber}. A loja confirma o pagamento em seguida.` };
    return { provider: 'manual', transactionId, status: PaymentStatus.PENDING, instructions };
  }
}
