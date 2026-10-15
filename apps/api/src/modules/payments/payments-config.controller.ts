import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MercadoPagoClient } from './mercado-pago.client';
import { maxAllowedInstallments, maxFreeInstallments, minFreeInstallment } from './payment-rules';
import { PaymentRouter } from './payment-router';

/** O que o navegador precisa para tokenizar o cartão e aplicar os limites de parcelas da loja. */
@ApiTags('Pagamentos')
@Controller('payments')
export class PaymentsConfigController {
  constructor(private readonly client: MercadoPagoClient, private readonly router: PaymentRouter) {}

  @Get('config')
  config() {
    const gateway = this.router.cardGateway();
    const maxInstallments = maxAllowedInstallments();
    const maxFree = maxFreeInstallments();
    const minFree = minFreeInstallment();
    const boleto = this.client.configured;
    return { card: gateway === 'mercadopago' ? { provider: 'mercadopago', publicKey: this.client.publicKey, maxInstallments, maxFreeInstallments: maxFree, minFreeInstallment: minFree } : null, boleto };
  }
}
