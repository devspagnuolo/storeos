import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
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

/** PIX pelo Mercado Pago: devolve QR code e código copia e cola; a confirmação chega por webhook. */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  constructor(private readonly client: MercadoPagoClient) {}

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const apiUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
    const payment = await this.client.createPixPayment({
      amount: Number(request.amount),
      description: `Pedido ${request.orderNumber}`,
      orderNumber: request.orderNumber,
      expiresAt: request.expiresAt,
      payer: { email: request.customer.email, firstName: request.customer.name.split(' ')[0] },
      notificationUrl: apiUrl && `${apiUrl}/api/v1/payments/webhooks/mercadopago`,
    });
    const data = payment.point_of_interaction?.transaction_data ?? {};
    return {
      provider: MERCADO_PAGO,
      transactionId: String(payment.id),
      status: mapMercadoPagoStatus(payment.status),
      instructions: {
        message: `Pague ${formatAmount(request.amount, request.currency)} via PIX escaneando o QR code ou usando o código copia e cola. A confirmação é automática.`,
        pixCode: data.qr_code,
        qrCodeBase64: data.qr_code_base64,
        ticketUrl: data.ticket_url,
      },
    };
  }
}
