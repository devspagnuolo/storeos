import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { ChargeRequest, ChargeResult, PaymentProvider } from './payment-provider';
import { RedeClient } from './rede.client';

export const REDE = 'rede';

/** Cartão de crédito pela Rede, com captura imediata: o retorno é síncrono, não há webhook. */
@Injectable()
export class RedeProvider implements PaymentProvider {
  constructor(private readonly client: RedeClient) {}

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const card = request.card;
    if (!card?.number || !card.holder || !card.expMonth || !card.expYear || !card.cvv) throw new Error('Dados do cartão ausentes');
    const result = await this.client.authorize({
      // A referência da Rede aceita só letras e números.
      reference: request.orderNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
      amountCents: Math.round(Number(request.amount) * 100),
      installments: card.installments,
      card: { number: card.number, holder: card.holder, expMonth: card.expMonth, expYear: card.expYear, cvv: card.cvv },
      softDescriptor: process.env.REDE_SOFT_DESCRIPTOR || undefined,
    });
    const approved = result.returnCode === '00';
    return {
      provider: REDE,
      transactionId: result.tid ?? `rede_${request.orderNumber}`,
      status: approved ? PaymentStatus.PAID : PaymentStatus.FAILED,
      declineDetail: approved ? null : result.returnCode,
      instructions: { message: approved ? `Pagamento aprovado${card.installments > 1 ? ` em ${card.installments}x` : ''}. Você receberá a confirmação por e-mail.` : 'Pagamento não aprovado.', installments: card.installments },
    };
  }
}
