import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { CardGateway, ChargeRequest, PaymentProvider } from './payment-provider';

/** PIX, boleto e cartão vão para o Mercado Pago quando há credencial configurada; sem ela, só PIX e boleto manuais. */
@Injectable()
export class PaymentRouter implements PaymentProvider {
  constructor(private readonly manual: ManualPaymentProvider, private readonly mercadoPago: MercadoPagoProvider, private readonly mercadoPagoClient: MercadoPagoClient) {}

  createCharge(request: ChargeRequest) {
    return (this.mercadoPagoClient.configured ? this.mercadoPago : this.manual).createCharge(request);
  }

  /** O cartão só existe com o Mercado Pago configurado, com a chave pública que tokeniza o cartão no navegador. */
  cardGateway(): CardGateway | null {
    return this.mercadoPagoClient.configured && this.mercadoPagoClient.publicKey ? 'mercadopago' : null;
  }

  /** O Mercado Pago pede CPF no cartão e no boleto. */
  requiresTaxId(method: PaymentMethod) {
    return this.mercadoPagoClient.configured && (method === PaymentMethod.CREDIT_CARD || method === PaymentMethod.BOLETO);
  }

  supports(method: PaymentMethod) {
    return method !== PaymentMethod.CREDIT_CARD || this.cardGateway() !== null;
  }
}
