import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { ChargeRequest, PaymentProvider } from './payment-provider';

/** PIX, boleto e cartão vão para o Mercado Pago quando há credencial configurada; sem ela, só PIX e boleto manuais. */
@Injectable()
export class PaymentRouter implements PaymentProvider {
  constructor(private readonly manual: ManualPaymentProvider, private readonly mercadoPago: MercadoPagoProvider, private readonly mercadoPagoClient: MercadoPagoClient) {}

  createCharge(request: ChargeRequest) {
    return (this.mercadoPagoClient.configured ? this.mercadoPago : this.manual).createCharge(request);
  }

  requiresTaxId(method: PaymentMethod) {
    return this.mercadoPagoClient.configured && method !== PaymentMethod.PIX;
  }

  supports(method: PaymentMethod) {
    return method !== PaymentMethod.CREDIT_CARD || (this.mercadoPagoClient.configured && Boolean(this.mercadoPagoClient.publicKey));
  }
}
