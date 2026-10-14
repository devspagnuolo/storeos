import { Injectable } from '@nestjs/common';

export type MercadoPagoPayment = {
  id: number;
  status: 'pending' | 'approved' | 'authorized' | 'in_process' | 'in_mediation' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
  external_reference: string | null;
  transaction_amount: number;
  status_detail?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  transaction_details?: { external_resource_url?: string | null; total_paid_amount?: number };
  barcode?: { content?: string | null };
};

export type PayerAddress = { zipCode: string; street: string; number: string; district?: string; city: string; state: string };
export type CreatePayment = {
  method: 'pix' | 'boleto' | 'card';
  amount: number;
  description: string;
  orderNumber: string;
  expiresAt: Date;
  payer: { email: string; firstName: string; lastName?: string; cpf?: string; address?: PayerAddress };
  card?: { token: string; installments: number; paymentMethodId: string; issuerId?: string };
  notificationUrl?: string;
};

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

  /** Consulta barata para validar a credencial. Não cria nada. */
  async ping(): Promise<'ok' | 'unauthorized' | 'error'> {
    try {
      await this.request('/users/me');
      return 'ok';
    } catch (error) {
      return /falhou com (401|403)/.test((error as Error).message) ? 'unauthorized' : 'error';
    }
  }

  get publicKey() {
    return process.env.MERCADOPAGO_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || undefined;
  }

  createPayment(input: CreatePayment) {
    const { payer } = input;
    const identification = payer.cpf && { type: 'CPF', number: payer.cpf };
    const method = input.method === 'card'
      ? { token: input.card!.token, installments: input.card!.installments, payment_method_id: input.card!.paymentMethodId, ...(input.card!.issuerId && { issuer_id: Number(input.card!.issuerId) }) }
      : { payment_method_id: input.method === 'pix' ? 'pix' : 'bolbradesco', date_of_expiration: input.expiresAt.toISOString().replace('Z', '+00:00') };
    return this.request<MercadoPagoPayment>('/v1/payments', {
      method: 'POST',
      // A chave de idempotência evita cobrança duplicada se a requisição for repetida.
      idempotencyKey: `storeos-${input.orderNumber}`,
      body: JSON.stringify({
        transaction_amount: input.amount,
        description: input.description,
        external_reference: input.orderNumber,
        ...method,
        payer: {
          email: payer.email,
          first_name: payer.firstName,
          ...(payer.lastName && { last_name: payer.lastName }),
          ...(identification && { identification }),
          // O boleto registrado exige o endereço do pagador.
          ...(input.method === 'boleto' && payer.address && { address: { zip_code: payer.address.zipCode, street_name: payer.address.street, street_number: payer.address.number, neighborhood: payer.address.district || payer.address.city, city: payer.address.city, federal_unit: payer.address.state } }),
        },
        ...(input.notificationUrl && { notification_url: input.notificationUrl }),
      }),
    });
  }

  getPayment(id: string) {
    return this.request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`);
  }
}
