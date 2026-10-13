export type PaymentMethodKind = 'PIX' | 'CREDIT_CARD' | 'BOLETO';
export type ProviderPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CHARGEBACK';

export interface CreateChargeInput {
  storeId: string;
  orderId: string;
  orderNumber: string;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  cardToken?: string;
  cardPaymentMethodId?: string;
  payer: { name: string; email: string; document: string; phone?: string };
  idempotencyKey: string;
  notificationUrl: string;
  /** Config/credenciais da loja para este provedor (já decifradas). */
  credentials: Record<string, string>;
}

export interface ChargeResult {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  providerStatus: string;
  failureReason?: string;
  cardBrand?: string;
  cardLast4?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
  expiresAt?: Date;
  raw?: unknown;
}

export interface WebhookParse {
  valid: boolean;
  eventId: string;
  eventType?: string;
  providerPaymentId?: string;
}

/** Porta para provedores de pagamento (Mercado Pago, Pagar.me, Stripe, Asaas, PagSeguro, PayPal…). */
export interface PaymentProvider {
  readonly key: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  /** Consulta o estado atual no provedor (fonte da verdade — nunca confiar no corpo do webhook). */
  fetchPayment(providerPaymentId: string, credentials: Record<string, string>): Promise<ChargeResult>;
  refund(providerPaymentId: string, amountCents: number | null, credentials: Record<string, string>): Promise<{ providerRefundId: string; status: 'COMPLETED' | 'PENDING' | 'FAILED' }>;
  parseWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer; query: Record<string, string>; credentials: Record<string, string> }): WebhookParse;
}
