'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from './config';
import { lineKey, type CartItem } from './cart';

export type Availability = { productId: string; variantId: string | null; active: boolean; available: number; price: string | null };
export type StockIssue = { kind: 'unavailable' } | { kind: 'over'; available: number } | null;

/** Saldo livre e preço atual de cada linha, direto da API (sem cache), para o carrinho nunca passar do estoque. */
export async function fetchAvailability(storeSlug: string, items: Pick<CartItem, 'productId' | 'variantId'>[]): Promise<Map<string, Availability>> {
  const response = await fetch(`${apiUrl}/catalog/availability`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ store: storeSlug, items: items.map(i => ({ productId: i.productId, ...(i.variantId && { variantId: i.variantId }) })) }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Não foi possível consultar o estoque.');
  const rows = (await response.json()) as Availability[];
  return new Map(rows.map(row => [lineKey({ productId: row.productId, variantId: row.variantId ?? undefined }), row]));
}

/** Situação da linha frente ao estoque: fora de venda, acima do saldo, ou ok. Sem consulta ainda, não acusa nada. */
export function stockIssue(item: CartItem, info?: Availability): StockIssue {
  if (!info) return null;
  if (!info.active || info.available < 1) return { kind: 'unavailable' };
  return item.quantity > info.available ? { kind: 'over', available: info.available } : null;
}

export const stockMessage = (issue: NonNullable<StockIssue>) => issue.kind === 'unavailable' ? 'Este item esgotou ou saiu de venda. Remova para continuar.' : `Temos só ${issue.available} ${issue.available === 1 ? 'unidade disponível' : 'unidades disponíveis'}. Ajuste a quantidade.`;

/**
 * Mantém o estoque das linhas do carrinho atualizado: consulta ao montar, quando o carrinho muda,
 * quando a aba volta ao foco e a cada 30 segundos, para refletir vendas e ajustes feitos no painel.
 */
export function useAvailability(storeSlug: string, items: CartItem[]) {
  const [map, setMap] = useState<Map<string, Availability>>(new Map());
  const key = items.map(lineKey).sort().join(',');
  const refresh = useCallback(async () => {
    if (!key) return setMap(new Map());
    try { setMap(await fetchAvailability(storeSlug, key.split(',').map(k => { const [productId, variantId] = k.split(':'); return { productId, variantId }; }))); } catch { /* mantém a última consulta */ }
  }, [storeSlug, key]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 30_000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh]);
  return { availability: map, refresh };
}
