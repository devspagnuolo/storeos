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

/** Quanto falta para o frete grátis, para o carrinho incentivar completar o pedido. Null quando não há regra. */
export function freeShippingProgress(subtotal: number, freeShipping: FreeShipping | null | undefined): { missing: number; percent: number; regional: boolean } | null {
  const from = Number(freeShipping?.from);
  if (!freeShipping || !(from > 0)) return null;
  const missing = Math.max(Math.round((from - subtotal) * 100) / 100, 0);
  return { missing, percent: Math.min(Math.round((subtotal / from) * 100), 100), regional: !freeShipping.nationwide };
}
