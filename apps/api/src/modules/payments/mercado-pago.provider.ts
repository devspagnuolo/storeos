import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { MercadoPagoClient } from './mercado-pago.client';
import { ChargeRequest, ChargeResult, formatAmount, PaymentProvider } from './payment-provider';

export const MERCADO_PAGO = 'mercadopago';

export function mapMercadoPagoStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved': return PaymentStatus.PAID;
    case 'authorized': return PaymentStatus.AUTHORIZED;
    case 'rejected': return PaymentStatus.FAILED;
    case 'cancelled': return PaymentStatus.CANCELLED;
    case 'refunded':
    case 'charged_back': return PaymentStatus.REFUNDED;
    default: return PaymentStatus.PENDING;
  }
}

/** Mercado Pago: PIX (QR e copia e cola), boleto e cartão com parcelas. A confirmação definitiva chega por webhook. */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  constructor(private readonly client: MercadoPagoClient) {}

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const apiUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
    const [firstName, ...rest] = request.customer.name.trim().split(/\s+/);
    const method = request.method === PaymentMethod.CREDIT_CARD ? 'card' : request.method === PaymentMethod.BOLETO ? 'boleto' : 'pix';
    if (method === 'card' && (!request.card?.token || !request.card.paymentMethodId)) throw new Error('Cartão sem token');
    const payment = await this.client.createPayment({
      method,
      amount: Number(request.amount),
      description: `Pedido ${request.orderNumber}`,
      orderNumber: request.orderNumber,
      expiresAt: request.expiresAt,
      payer: { email: request.customer.email, firstName, lastName: rest.join(' ') || undefined, cpf: request.customer.cpf, address: request.customer.address },
      card: method === 'card' ? { token: request.card!.token!, paymentMethodId: request.card!.paymentMethodId!, installments: request.card!.installments, issuerId: request.card!.issuerId } : undefined,
      notificationUrl: apiUrl && `${apiUrl}/api/v1/payments/webhooks/mercadopago`,
    });
    const status = mapMercadoPagoStatus(payment.status);
    const base = { provider: MERCADO_PAGO, transactionId: String(payment.id), status, declineDetail: payment.status_detail ?? null };
    const amount = formatAmount(request.amount, request.currency);
    if (method === 'card') {
      const installments = request.card!.installments;
      const message = status === PaymentStatus.PAID ? `Pagamento aprovado${installments > 1 ? ` em ${installments}x` : ''}. Você receberá a confirmação por e-mail.`
        : status === PaymentStatus.PENDING ? 'Estamos aguardando a confirmação do seu cartão. Avisamos por e-mail assim que for aprovado.'
        : 'Pagamento não aprovado.';
      return { ...base, instructions: { message, installments } };
    }
    if (method === 'boleto') {
      return { ...base, instructions: { message: `Pague o boleto de ${amount} até ${request.expiresAt.toLocaleDateString('pt-BR')}. A compensação leva até 2 dias úteis.`, ticketUrl: payment.transaction_details?.external_resource_url ?? undefined, barcode: payment.barcode?.content ?? undefined } };
    }
    const data = payment.point_of_interaction?.transaction_data ?? {};
    return {
      ...base,
      instructions: {
        message: `Pague ${amount} via PIX escaneando o QR code ou usando o código copia e cola. A confirmação é automática.`,
        pixCode: data.qr_code,
        qrCodeBase64: data.qr_code_base64,
        ticketUrl: data.ticket_url,
      },
    };
  }
}
