import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { ChargeRequest, PaymentProvider } from './payment-provider';

/** PIX vai para o Mercado Pago quando há credencial configurada; o resto segue manual. */
@Injectable()
export class PaymentRouter implements PaymentProvider {
  constructor(private readonly manual: ManualPaymentProvider, private readonly mercadoPago: MercadoPagoProvider, private readonly mercadoPagoClient: MercadoPagoClient) {}

  createCharge(request: ChargeRequest) {
    const provider = request.method === PaymentMethod.PIX && this.mercadoPagoClient.configured ? this.mercadoPago : this.manual;
    return provider.createCharge(request);
  }
}
