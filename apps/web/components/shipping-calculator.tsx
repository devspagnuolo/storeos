'use client';
import { FormEvent, useEffect, useId, useState } from 'react';
import type { CartItem } from '../lib/cart';
import { formatCep, quoteShipping, rememberCep, ShippingQuote } from '../lib/shipping';
import { useStoreBrand } from './store-name';
import { ShippingOptions } from './shipping-options';

export function ShippingCalculator({ items, bare = false }: { items: CartItem[]; bare?: boolean }) {
  const { slug } = useStoreBrand();
  const id = useId();
  const [cep, setCep] = useState('');
  // O CEP salvo entra depois de montar, para a página do produto (renderizada no servidor) não divergir na hidratação.
  useEffect(() => setCep(current => current || rememberCep()), []);
  const [quote, setQuote] = useState<ShippingQuote>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      setQuote(await quoteShipping(slug, cep, items));
      rememberCep(cep);
    } catch (e) {
      setQuote(undefined);
      setError(e instanceof Error ? e.message : 'Não foi possível calcular o frete.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={bare ? 'mt-2' : 'mt-4 border-t pt-4'}>
      <form onSubmit={onSubmit} className="flex gap-2">
        <label className="sr-only" htmlFor={id}>CEP</label>
        <input id={id} inputMode="numeric" placeholder="Calcular frete: CEP" value={cep} onChange={e => setCep(formatCep(e.target.value))} pattern="\d{5}-\d{3}" required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-xl border border-slate-300 px-3 text-sm font-medium disabled:opacity-60" disabled={loading}>{loading ? '…' : 'OK'}</button>
      </form>
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-slate-500 underline">Não sei meu CEP</a>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {quote && <div className="mt-3"><ShippingOptions quote={quote} /></div>}
    </div>
  );
}
