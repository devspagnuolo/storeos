import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MercadoPagoClient } from './mercado-pago.client';
import { clampInstallments } from './payment-rules';

/** O que o navegador precisa para tokenizar o cartão: a chave pública (feita para ser exposta) e o limite de parcelas. */
@ApiTags('Pagamentos')
@Controller('payments')
export class PaymentsConfigController {
  constructor(private readonly client: MercadoPagoClient) {}

  @Get('config')
  config() {
    const publicKey = this.client.configured ? this.client.publicKey : undefined;
    return { card: publicKey ? { provider: 'mercadopago', publicKey, maxInstallments: clampInstallments(12) } : null };
  }
}
