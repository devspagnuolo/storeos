import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MercadoPagoClient } from './mercado-pago.client';
import { maxAllowedInstallments, maxFreeInstallments } from './payment-rules';
import { PaymentRouter } from './payment-router';

/** O que o navegador precisa para tokenizar o cartão: a chave pública (feita para ser exposta) e o limite de parcelas. */
@ApiTags('Pagamentos')
@Controller('payments')
export class PaymentsConfigController {
  constructor(private readonly client: MercadoPagoClient, private readonly router: PaymentRouter) {}

  @Get('config')
  config() {
    const gateway = this.router.cardGateway();
    const maxInstallments = maxAllowedInstallments();
    const maxFree = maxFreeInstallments();
    // O boleto registrado só existe com o Mercado Pago; sem ele a loja segue com PIX manual.
    const boleto = this.client.configured;
    if (gateway === 'rede') return { card: { provider: 'rede', maxInstallments, maxFreeInstallments: maxInstallments, minInstallment: Number(process.env.REDE_MIN_INSTALLMENT ?? 5) }, boleto };
    return { card: gateway === 'mercadopago' ? { provider: 'mercadopago', publicKey: this.client.publicKey, maxInstallments, maxFreeInstallments: maxFree } : null, boleto };
  }
}
