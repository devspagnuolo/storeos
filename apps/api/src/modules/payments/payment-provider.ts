import { PaymentMethod, PaymentStatus } from '@prisma/client';

export type CardPayment = { token: string; installments: number; paymentMethodId: string; issuerId?: string };
export type ChargeCustomer = { name: string; email: string; cpf?: string; address?: { zipCode: string; street: string; number: string; district?: string; city: string; state: string } };
export type ChargeRequest = { storeId: string; orderNumber: string; amount: string; currency: string; method: PaymentMethod; expiresAt: Date; customer: ChargeCustomer; card?: CardPayment };
export type ChargeInstructions = { message: string; pixCode?: string; qrCodeBase64?: string; ticketUrl?: string; barcode?: string; installments?: number };
export type ChargeResult = { provider: string; transactionId: string; status: PaymentStatus; instructions: ChargeInstructions; declineDetail?: string | null };

/** Porta de pagamento: cada gateway é um adaptador; o roteador escolhe qual atende cada método. */
export interface PaymentProvider {
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
  /** Se o meio de pagamento pode ser cobrado agora (o cartão só existe com um gateway configurado). */
  supports?(method: PaymentMethod): boolean;
  /** Se o gateway exige o CPF do pagador para este meio (cartão e boleto registrado). */
  requiresTaxId?(method: PaymentMethod): boolean;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Prazo para pagar antes de a reserva de estoque ser liberada. */
export function paymentDeadline(method: PaymentMethod, now = new Date()) {
  const minutes = method === PaymentMethod.BOLETO ? 3 * 24 * 60 : Number(process.env.PIX_EXPIRATION_MINUTES ?? 60);
  return new Date(now.getTime() + minutes * 60_000);
}

export const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(amount));
