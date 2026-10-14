import { Injectable } from '@nestjs/common';

export type MercadoPagoPayment = {
  id: number;
  status: 'pending' | 'approved' | 'authorized' | 'in_process' | 'in_mediation' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
  external_reference: string | null;
  transaction_amount: number;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
};

export type CreatePixPayment = { amount: number; description: string; orderNumber: string; expiresAt: Date; payer: { email: string; firstName: string }; notificationUrl?: string };

/** Cliente HTTP mínimo da API de pagamentos do Mercado Pago. */
@Injectable()
export class MercadoPagoClient {
  private readonly baseUrl = 'https://api.mercadopago.com';

  get configured() {
    return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
  }

  private async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'content-type': 'application/json',
        ...(init.idempotencyKey && { 'x-idempotency-key': init.idempotencyKey }),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Mercado Pago ${init.method ?? 'GET'} ${path} falhou com ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json() as Promise<T>;
  }

  createPixPayment(input: CreatePixPayment) {
    return this.request<MercadoPagoPayment>('/v1/payments', {
      method: 'POST',
      // A chave de idempotência evita cobrança duplicada se a requisição for repetida.
      idempotencyKey: `storeos-${input.orderNumber}`,
      body: JSON.stringify({
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.orderNumber,
        date_of_expiration: input.expiresAt.toISOString().replace('Z', '+00:00'),
        payer: { email: input.payer.email, first_name: input.payer.firstName },
        ...(input.notificationUrl && { notification_url: input.notificationUrl }),
      }),
    });
  }

  getPayment(id: string) {
    return this.request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`);
  }
}
