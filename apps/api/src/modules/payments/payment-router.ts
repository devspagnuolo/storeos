import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { CardGateway, ChargeRequest, PaymentProvider } from './payment-provider';
import { RedeClient } from './rede.client';
import { RedeProvider } from './rede.provider';

/** PIX, boleto e cartão vão para o Mercado Pago quando há credencial configurada; sem ela, só PIX e boleto manuais. */
@Injectable()
export class PaymentRouter implements PaymentProvider {
  constructor(private readonly manual: ManualPaymentProvider, private readonly mercadoPago: MercadoPagoProvider, private readonly mercadoPagoClient: MercadoPagoClient, private readonly rede: RedeProvider, private readonly redeClient: RedeClient) {}

  createCharge(request: ChargeRequest) {
    if (request.method === PaymentMethod.CREDIT_CARD && this.cardGateway() === 'rede') return this.rede.createCharge(request);
    return (this.mercadoPagoClient.configured ? this.mercadoPago : this.manual).createCharge(request);
  }

  /** A Rede, quando configurada, cobra o cartão; PIX e boleto continuam no Mercado Pago. */
  cardGateway(): CardGateway | null {
    if (this.redeClient.configured) return 'rede';
    return this.mercadoPagoClient.configured && this.mercadoPagoClient.publicKey ? 'mercadopago' : null;
  }

  requiresTaxId(method: PaymentMethod) {
    // A Rede só cobra cartão e não pede CPF; o Mercado Pago pede CPF no cartão e no boleto.
    if (method === PaymentMethod.CREDIT_CARD) return this.cardGateway() === 'mercadopago';
    return this.mercadoPagoClient.configured && method === PaymentMethod.BOLETO;
  }

  supports(method: PaymentMethod) {
    return method !== PaymentMethod.CREDIT_CARD || this.cardGateway() !== null;
  }
}
