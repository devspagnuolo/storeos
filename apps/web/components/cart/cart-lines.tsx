'use client';
import Link from 'next/link';
import { stockIssue, stockMessage, type Availability } from '../../lib/availability';
import { lineKey, MAX_QUANTITY, useCart, type CartItem } from '../../lib/cart';
import { formatPrice } from '../../lib/format';

/**
 * Linhas do carrinho com controle de quantidade limitado ao estoque real.
 * Usada no carrinho e no resumo do checkout, para as duas telas mostrarem a mesma coisa.
 */
export function CartLines({ items, availability, compact = false }: { items: CartItem[]; availability: Map<string, Availability>; compact?: boolean }) {
  const setQuantity = useCart(state => state.setQuantity);
  return (
    <ul className={compact ? 'divide-y text-sm' : 'card h-fit divide-y'}>
      {items.map(item => {
        const key = lineKey(item);
        const info = availability.get(key);
        const issue = stockIssue(item, info);
        const max = Math.min(info ? info.available : MAX_QUANTITY, MAX_QUANTITY);
        const atMax = Boolean(info) && item.quantity >= max;
        return (
          <li key={key} className={compact ? 'py-3' : 'p-4'}>
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
              {!compact && <div className="h-16 w-16 shrink-0 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-slate-100">{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-contain object-center" />}</div>}
              <div className="min-w-0 flex-1">
                <Link href={`/produto/${item.slug}`} className="font-semibold hover:text-brand">{item.name}</Link>
                {item.variantLabel && <p className="text-sm text-slate-600">{item.variantLabel}</p>}
                <p className="text-sm text-slate-500">{formatPrice(item.price)}{info && info.available > 0 && info.available <= 5 && !issue && <span className="ml-2 text-amber-700">· restam {info.available}</span>}</p>
              </div>
              {/* No celular, quantidade e total descem para a linha de baixo para o nome não ser espremido. */}
              <div className={'flex items-center gap-3 sm:contents' + (compact ? '' : ' max-sm:w-full max-sm:justify-end')}>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label={`Diminuir ${item.name}`} className="h-8 w-8 rounded-lg border" onClick={() => setQuantity(key, item.quantity - 1)}>−</button>
                <span className="w-7 text-center" aria-live="polite">{item.quantity}</span>
                <button type="button" aria-label={`Aumentar ${item.name}`} title={atMax ? `Máximo disponível: ${max}` : undefined} disabled={atMax} className="h-8 w-8 rounded-lg border disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setQuantity(key, item.quantity + 1)}>+</button>
              </div>
              <p className={'text-right font-bold ' + (compact ? 'w-20' : 'w-24 sm:w-28')}>{formatPrice((Number(item.price) * 100 * item.quantity) / 100)}</p>
              </div>
            </div>
            {atMax && !issue && <p className="mt-2 text-xs text-slate-500">Você já tem no carrinho todas as {max} unidades disponíveis.</p>}
            {issue && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>{stockMessage(issue)}</span>
                <button type="button" className="font-semibold underline" onClick={() => setQuantity(key, issue.kind === 'over' ? issue.available : 0)}>{issue.kind === 'over' ? `Ajustar para ${issue.available}` : 'Remover'}</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Algum item acima do estoque ou fora de venda? Bloqueia seguir para o pagamento. */
export const hasStockIssues = (items: CartItem[], availability: Map<string, Availability>) => items.some(item => stockIssue(item, availability.get(lineKey(item))));
