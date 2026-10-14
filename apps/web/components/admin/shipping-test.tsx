'use client';
import { useState, useTransition } from 'react';
import { shippingTestAction } from '../../app/admin/actions';
import type { ShippingTestResult } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';

export function ShippingTest() {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState<ShippingTestResult>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setError(undefined);
    setResult(undefined);
    const response = await shippingTestAction(zip);
    if (response.error) setError(response.error); else setResult(response.result);
  });
  return <div>
    <form onSubmit={event => { event.preventDefault(); run(); }} className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">CEP de destino<input value={zip} onChange={event => setZip(event.target.value)} inputMode="numeric" placeholder="01310-100" className="mt-1 block rounded-lg border px-3 py-2" /></label>
      <button disabled={pending} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">{pending ? 'Cotando…' : 'Testar cotação de frete'}</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {result && <div role="status" className="mt-3 text-sm">
      <p className="text-slate-500">Cotação de 1 unidade de “{result.product}” em {result.elapsedMs} ms.</p>
      {result.options.length === 0
        ? <p className="mt-2 font-medium text-amber-800">Nenhuma opção de entrega para este CEP.{result.required ? ' O checkout vai bloquear compras neste destino.' : ''}</p>
        : <ul className="mt-2 divide-y divide-slate-100">{result.options.map(option => <li key={option.id} className="flex justify-between gap-4 py-2"><span>{option.name} · {option.minDays === option.maxDays ? option.minDays : `${option.minDays}–${option.maxDays}`} dias úteis</span><strong>{option.free ? 'Grátis' : formatPrice(option.price)}</strong></li>)}</ul>}
    </div>}
  </div>;
}
