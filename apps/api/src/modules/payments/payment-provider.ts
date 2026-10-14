import { PaymentMethod, PaymentStatus } from '@prisma/client';

export type ChargeRequest = { storeId: string; orderNumber: string; amount: string; currency: string; method: PaymentMethod; customer: { name: string; email: string } };
export type ChargeResult = { provider: string; transactionId: string; status: PaymentStatus; instructions: Record<string, string> };

/** Porta de pagamento: gateways reais (Mercado Pago, Pagar.me) entram como novos adaptadores. */
export interface PaymentProvider {
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
