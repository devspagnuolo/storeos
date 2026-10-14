'use client';
import { formatPrice } from '../lib/format';
import { deliveryTime, ShippingQuote } from '../lib/shipping';

/** Lista de opções de frete; com `name`, vira um grupo de rádio para o formulário do checkout. */
export function ShippingOptions({ quote, name, selected, onSelect }: { quote: ShippingQuote; name?: string; selected?: string; onSelect?: (id: string) => void }) {
  if (!quote.required) return <p className="text-sm text-slate-500">Frete a combinar com a loja após o pedido.</p>;
  if (!quote.options.length) return <p className="text-sm text-red-700">Ainda não entregamos neste CEP.</p>;
  return (
    <ul className="grid gap-2">
      {quote.options.map(option => {
        const content = (
          <>
            <span className="flex-1"><b className="block font-semibold">{option.name}</b><span className="text-slate-500">{deliveryTime(option)}</span></span>
            <span className={option.free ? 'font-bold text-emerald-700' : 'font-bold'}>{option.free ? 'Grátis' : formatPrice(option.price)}</span>
          </>
        );
        return (
          <li key={option.id}>
            {name ? (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand">
                <input type="radio" name={name} value={option.id} required checked={selected === option.id} onChange={() => onSelect?.(option.id)} />
                {content}
              </label>
            ) : <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}
