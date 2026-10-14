import { Injectable } from '@nestjs/common';

export type RedeTransaction = { returnCode: string; returnMessage: string; tid?: string; nsu?: string; authorizationCode?: string; reference?: string; amount?: number };
export type RedeCharge = { reference: string; amountCents: number; installments: number; card: { number: string; holder: string; expMonth: number; expYear: number; cvv: string }; softDescriptor?: string };

/**
 * Cliente da API e.Rede (Itaú). Autenticação Basic com PV (filiação) e token de integração.
 * O número do cartão só existe em memória durante a chamada: não é logado nem gravado.
 */
@Injectable()
export class RedeClient {
  get configured() {
    return Boolean(process.env.REDE_PV && process.env.REDE_TOKEN);
  }

  private get baseUrl() {
    return process.env.REDE_SANDBOX === 'true' ? 'https://api.userede.com.br/desenvolvedores/v1' : 'https://api.userede.com.br/erede/v1';
  }

  async authorize(input: RedeCharge): Promise<RedeTransaction> {
    const response = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${process.env.REDE_PV}:${process.env.REDE_TOKEN}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        capture: true,
        kind: 'credit',
        reference: input.reference,
        amount: input.amountCents,
        installments: input.installments,
        cardholderName: input.card.holder,
        cardNumber: input.card.number,
        expirationMonth: input.card.expMonth,
        expirationYear: input.card.expYear,
        securityCode: input.card.cvv,
        ...(input.softDescriptor && { softDescriptor: input.softDescriptor }),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => undefined)) as RedeTransaction | undefined;
    // Recusa do cartão chega com HTTP 200 e returnCode != "00"; erro de credencial ou de formato vem como 4xx/5xx.
    if (!body?.returnCode) throw new Error(`Rede respondeu ${response.status} sem retorno`);
    return body;
  }
}
