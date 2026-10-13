import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { toCents } from '../../../shared/domain/money';
import { ExternalServiceError } from '../../../shared/domain/errors';
import { safeEqual } from '../../../shared/infrastructure/crypto/encryption.service';
import { HttpClient } from '../../../shared/infrastructure/http/http-client';
import { ChargeResult, CreateChargeInput, PaymentProvider, ProviderPaymentStatus, WebhookParse } from './payment-provider';

interface MpPayment {
  id: number;
  status: string;
  status_detail?: string;
  payment_method_id?: string;
  card?: { last_four_digits?: string };
  transaction_amount?: number;
  date_of_expiration?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  transaction_details?: { external_resource_url?: string; barcode?: { content?: string } };
  message?: string;
  cause?: { description?: string }[];
}

const API = 'https://api.mercadopago.com';

const STATUS_MAP: Record<string, ProviderPaymentStatus> = {
  approved: 'PAID',
  authorized: 'AUTHORIZED',
  pending: 'PENDING',
  in_process: 'PENDING',
  in_mediation: 'PENDING',
  rejected: 'FAILED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
  charged_back: 'CHARGEBACK',
};

/**
 * Mercado Pago (API de Pagamentos v1). Credenciais por loja: { accessToken, webhookSecret }.
 * Cartão exige token gerado no navegador pelo MercadoPago.js — o backend nunca vê o PAN.
 * Validar em sandbox (credenciais de teste) antes de produção.
 */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  readonly key = 'mercadopago';

  constructor(private readonly http: HttpClient) {}

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const token = this.token(input.credentials);
    const [firstName, ...rest] = input.payer.name.trim().split(/\s+/);
    const doc = input.payer.document.replace(/\D/g, '');
    const body: Record<string, unknown> = {
      transaction_amount: input.amountCents / 100,
      description: `Pedido ${input.orderNumber}`,
      external_reference: input.orderId,
      notification_url: input.notificationUrl,
      payer: {
        email: input.payer.email,
        first_name: firstName,
        last_name: rest.join(' ') || firstName,
        identification: { type: doc.length === 14 ? 'CNPJ' : 'CPF', number: doc },
      },
    };
    if (input.method === 'PIX') {
      body.payment_method_id = 'pix';
      body.date_of_expiration = new Date(Date.now() + 30 * 60_000).toISOString().replace('Z', '-00:00');
    } else if (input.method === 'BOLETO') {
      body.payment_method_id = 'bolbradesco';
    } else {
      if (!input.cardToken) throw new ExternalServiceError('Token do cartão ausente', 'CARD_TOKEN_MISSING');
      body.token = input.cardToken;
      body.installments = input.installments;
      body.payment_method_id = input.cardPaymentMethodId;
    }

    const res = await this.http.request<MpPayment>({
      method: 'POST',
      url: `${API}/v1/payments`,
      headers: { authorization: `Bearer ${token}`, 'x-idempotency-key': input.idempotencyKey },
      body,
      retries: 1,
      timeoutMs: 20_000,
    });
    if (!res.data || (!res.ok && !res.data.status)) {
      const cause = res.data?.cause?.[0]?.description ?? res.data?.message ?? `HTTP ${res.status}`;
      throw new ExternalServiceError(`Mercado Pago recusou a requisição: ${cause}`, 'PAYMENT_PROVIDER_ERROR');
    }
    return this.map(res.data);
  }

  async fetchPayment(id: string, credentials: Record<string, string>): Promise<ChargeResult> {
    const res = await this.http.request<MpPayment>({ url: `${API}/v1/payments/${encodeURIComponent(id)}`, headers: { authorization: `Bearer ${this.token(credentials)}` } });
    if (!res.ok || !res.data) throw new ExternalServiceError(`Falha ao consultar pagamento (${res.status})`, 'PAYMENT_PROVIDER_ERROR');
    return this.map(res.data);
  }

  async refund(id: string, amountCents: number | null, credentials: Record<string, string>) {
    const res = await this.http.request<{ id?: number; status?: string; message?: string }>({
      method: 'POST',
      url: `${API}/v1/payments/${encodeURIComponent(id)}/refunds`,
      headers: { authorization: `Bearer ${this.token(credentials)}`, 'x-idempotency-key': `refund-${id}-${amountCents ?? 'full'}` },
      body: amountCents === null ? {} : { amount: amountCents / 100 },
    });
    if (!res.ok || !res.data?.id) throw new ExternalServiceError(`Estorno recusado: ${res.data?.message ?? res.status}`, 'REFUND_FAILED');
    return { providerRefundId: String(res.data.id), status: res.data.status === 'approved' ? ('COMPLETED' as const) : ('PENDING' as const) };
  }

  /** Valida x-signature ("ts=...,v1=...") conforme a documentação de webhooks do Mercado Pago. */
  parseWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer; query: Record<string, string>; credentials: Record<string, string> }): WebhookParse {
    let body: { id?: string | number; type?: string; action?: string; data?: { id?: string | number } } = {};
    try {
      body = JSON.parse(input.rawBody.toString('utf8') || '{}');
    } catch {
      /* corpo vazio em notificações IPN antigas */
    }
    const dataId = String(body.data?.id ?? input.query['data.id'] ?? input.query.id ?? '');
    const secret = input.credentials.webhookSecret;
    const header = String(input.headers['x-signature'] ?? '');
    const requestId = String(input.headers['x-request-id'] ?? '');
    let valid = false;
    if (secret && header) {
      const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
      const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
      const expected = createHmac('sha256', secret).update(manifest).digest('hex');
      valid = Boolean(parts.v1) && safeEqual(expected, parts.v1);
    }
    return { valid, eventId: `${body.type ?? body.action ?? 'payment'}:${dataId}:${String(input.headers['x-request-id'] ?? '')}`, eventType: body.type ?? body.action, providerPaymentId: dataId || undefined };
  }

  private token(credentials: Record<string, string>): string {
    if (!credentials.accessToken) throw new ExternalServiceError('Mercado Pago não configurado para esta loja', 'PAYMENT_NOT_CONFIGURED');
    return credentials.accessToken;
  }

  private map(p: MpPayment): ChargeResult {
    const status = STATUS_MAP[p.status] ?? 'PENDING';
    const expired = p.status === 'cancelled' && p.status_detail === 'expired';
    const tx = p.point_of_interaction?.transaction_data;
    return {
      providerPaymentId: String(p.id),
      status: expired ? 'EXPIRED' : status,
      providerStatus: `${p.status}${p.status_detail ? `/${p.status_detail}` : ''}`,
      failureReason: status === 'FAILED' ? (p.status_detail ?? 'rejeitado') : undefined,
      cardBrand: p.payment_method_id,
      cardLast4: p.card?.last_four_digits,
      pixQrCode: tx?.qr_code_base64,
      pixCopyPaste: tx?.qr_code,
      boletoUrl: p.transaction_details?.external_resource_url,
      boletoBarcode: p.transaction_details?.barcode?.content,
      expiresAt: p.date_of_expiration ? new Date(p.date_of_expiration) : undefined,
      raw: { id: p.id, status: p.status, status_detail: p.status_detail, amount: p.transaction_amount ? toCents(p.transaction_amount) : undefined },
    };
  }
}
