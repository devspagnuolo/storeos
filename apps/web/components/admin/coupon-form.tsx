'use client';
import { useActionState, useRef, useState } from 'react';
import { createBulkCouponsAction, createCouponAction } from '../../app/admin/actions';

type CategoryOption = { id: string; name: string; depth: number };

export function CouponForm({ categories }: { categories: CategoryOption[] }) {
  const [single, singleAction, singlePending] = useActionState(createCouponAction, {});
  const [bulk, bulkAction, bulkPending] = useActionState(createBulkCouponsAction, {});
  const [type, setType] = useState('PERCENT');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const ref = useRef<HTMLFormElement>(null);
  const state = mode === 'single' ? single : bulk;
  const pending = mode === 'single' ? singlePending : bulkPending;
  const run = mode === 'single' ? singleAction : bulkAction;
  return (
    <form ref={ref} action={async data => { await run(data); }} className="grid gap-4 sm:grid-cols-2">
      <div className="flex gap-2 text-sm sm:col-span-2" role="group" aria-label="Tipo de criação">
        <button type="button" onClick={() => setMode('single')} className={mode === 'single' ? 'button !py-1.5' : 'button-ghost !py-1.5'}>Um código</button>
        <button type="button" onClick={() => setMode('bulk')} className={mode === 'bulk' ? 'button !py-1.5' : 'button-ghost !py-1.5'}>Vários códigos únicos</button>
      </div>
      {mode === 'single'
        ? <label className="text-sm font-medium sm:col-span-2">Código<input name="code" required minLength={3} maxLength={32} className="input uppercase" placeholder="BEMVINDO10" /></label>
        : <>
          <label className="text-sm font-medium sm:col-span-2">Nome da campanha<input name="campaign" required minLength={2} maxLength={60} className="input" placeholder="Black Friday clientes VIP" /></label>
          <label className="text-sm font-medium">Início do código<input name="prefix" required minLength={2} maxLength={16} className="input uppercase" placeholder="VIP" /></label>
          <label className="text-sm font-medium">Quantidade (até 500)<input name="count" required inputMode="numeric" className="input" defaultValue="50" /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Cada código sai assim: VIP-K7M2QX, e só pode ser usado uma vez.</p>
        </>}
      <label className="text-sm font-medium">Tipo<select name="type" value={type} onChange={e => setType(e.target.value)} className="input"><option value="PERCENT">Percentual (%)</option><option value="FIXED">Valor fixo (R$)</option><option value="FREE_SHIPPING">Frete grátis</option></select></label>
      {type !== 'FREE_SHIPPING' && <label className="text-sm font-medium">{type === 'PERCENT' ? 'Percentual' : 'Valor'}<input name="value" required inputMode="decimal" className="input" /></label>}
      <label className="text-sm font-medium">Pedido mínimo (R$)<input name="minSubtotal" inputMode="decimal" className="input" /></label>
      {mode === 'single' && <label className="text-sm font-medium">Limite de usos<input name="maxUses" inputMode="numeric" className="input" placeholder="Sem limite" /></label>}
      <label className="flex items-end gap-2 pb-2 text-sm font-medium"><input type="checkbox" name="oncePerCustomer" /> Um uso por cliente</label>
      <label className="flex items-end gap-2 pb-2 text-sm font-medium"><input type="checkbox" name="firstOrderOnly" /> Só na primeira compra</label>
      <label className="text-sm font-medium sm:col-span-2">Vale só para estas categorias (opcional)
        <select name="categoryIds" multiple size={Math.min(6, Math.max(3, categories.length))} className="input">
          {categories.map(c => <option key={c.id} value={c.id}>{'— '.repeat(Math.max(0, c.depth - 1))}{c.name}</option>)}
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500">Deixe sem seleção para valer em toda a loja. Segure Ctrl (ou Cmd) para marcar várias. O desconto incide só nos itens dessas categorias.</span>
      </label>
      <label className="text-sm font-medium">Começa em<input name="startsAt" type="datetime-local" className="input" /></label>
      <label className="text-sm font-medium">Termina em<input name="endsAt" type="datetime-local" className="input" /></label>
      <div className="sm:col-span-2">
        {state.error && <p role="alert" className="mb-3 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="mb-3 text-sm text-emerald-700">{state.ok}</p>}
        <button className="button disabled:opacity-60" disabled={pending}>{mode === 'single' ? 'Criar cupom' : 'Gerar códigos'}</button>
      </div>
    </form>
  );
}
