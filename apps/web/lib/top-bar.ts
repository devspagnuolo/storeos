import { formatPrice } from './format';

export type FreeShipping = { from: string; nationwide: boolean };

export type TopBarMessage = { kind: 'shipping' | 'announcement'; text: string };

/** Mensagens da faixa do topo: frete grátis primeiro, depois o aviso do lojista (sem repetir quando o aviso já fala de frete). */
export function topBarMessages(announcement: string | null | undefined, freeShipping: FreeShipping | null | undefined): TopBarMessage[] {
  const text = announcement?.trim() ?? '';
  const messages: TopBarMessage[] = [];
  if (freeShipping && !/frete/i.test(text)) {
    messages.push({ kind: 'shipping', text: `Frete grátis acima de ${formatPrice(freeShipping.from)}${freeShipping.nationwide ? '' : ' para algumas regiões'}` });
  }
  if (text) messages.push({ kind: 'announcement', text });
  return messages;
}
