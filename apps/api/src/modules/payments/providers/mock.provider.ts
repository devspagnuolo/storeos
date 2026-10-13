import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ChargeResult, CreateChargeInput, PaymentProvider, WebhookParse } from './payment-provider';

/**
 * Provedor de desenvolvimento/testes. PIX e boleto ficam pendentes até a confirmação manual
 * (POST /store/dev/payments/:id/approve); cartão aprova, exceto tokens terminados em "fail".
 * Jamais habilitar em produção.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly key = 'mock';
  private readonly state = new Map<string, ChargeResult>();

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const id = `mock_${randomUUID()}`;
    let result: ChargeResult;
    if (input.method === 'CREDIT_CARD') {
      const declined = input.cardToken?.endsWith('fail');
      result = {
        providerPaymentId: id,
        status: declined ? 'FAILED' : 'PAID',
        providerStatus: declined ? 'rejected' : 'approved',
        failureReason: declined ? 'Cartão recusado pelo emissor' : undefined,
        cardBrand: input.cardPaymentMethodId ?? 'visa',
        cardLast4: '4242',
      };
    } else if (input.method === 'PIX') {
      result = {
        providerPaymentId: id,
        status: 'PENDING',
        providerStatus: 'pending',
        pixCopyPaste: `00020126580014br.gov.bcb.pix0136${id}5204000053039865802BR5909STOREOS6009SAO PAULO62070503***6304ABCD`,
        pixQrCode: Buffer.from(`pix:${id}`).toString('base64'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      };
    } else {
      result = {
        providerPaymentId: id,
        status: 'PENDING',
        providerStatus: 'pending',
        boletoUrl: `https://boleto.example.invalid/${id}`,
        boletoBarcode: '23793.38128 60000.000003 00000.000408 1 84340000010000',
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      };
    }
    this.state.set(id, result);
    return result;
  }

  async fetchPayment(id: string): Promise<ChargeResult> {
    const found = this.state.get(id);
    if (!found) return { providerPaymentId: id, status: 'PENDING', providerStatus: 'unknown' };
    return found;
  }

  approve(id: string): ChargeResult | null {
    const found = this.state.get(id);
    if (!found) return null;
    const next = { ...found, status: 'PAID' as const, providerStatus: 'approved' };
    this.state.set(id, next);
    return next;
  }

  async refund(): Promise<{ providerRefundId: string; status: 'COMPLETED' }> {
    return { providerRefundId: `mock_refund_${randomUUID()}`, status: 'COMPLETED' };
  }

  parseWebhook(input: { rawBody: Buffer }): WebhookParse {
    try {
      const body = JSON.parse(input.rawBody.toString('utf8')) as { id?: string; paymentId?: string };
      return { valid: true, eventId: body.id ?? randomUUID(), providerPaymentId: body.paymentId };
    } catch {
      return { valid: false, eventId: randomUUID() };
    }
  }
}
