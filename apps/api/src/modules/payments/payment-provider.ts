import { PaymentMethod, PaymentStatus } from '@prisma/client';

export type ChargeRequest = { storeId: string; orderNumber: string; amount: string; currency: string; method: PaymentMethod; expiresAt: Date; customer: { name: string; email: string } };
export type ChargeInstructions = { message: string; pixCode?: string; qrCodeBase64?: string; ticketUrl?: string };
export type ChargeResult = { provider: string; transactionId: string; status: PaymentStatus; instructions: ChargeInstructions };

/** Porta de pagamento: cada gateway é um adaptador; o roteador escolhe qual atende cada método. */
export interface PaymentProvider {
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Prazo para pagar antes de a reserva de estoque ser liberada. */
export function paymentDeadline(method: PaymentMethod, now = new Date()) {
  const minutes = method === PaymentMethod.BOLETO ? 3 * 24 * 60 : Number(process.env.PIX_EXPIRATION_MINUTES ?? 60);
  return new Date(now.getTime() + minutes * 60_000);
}

export const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(amount));
