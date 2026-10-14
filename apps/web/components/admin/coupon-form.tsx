'use client';
import { useActionState, useRef, useState } from 'react';
import { createCouponAction } from '../../app/admin/actions';

export function CouponForm() {
  const [state, action, pending] = useActionState(createCouponAction, {});
  const [type, setType] = useState('PERCENT');
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={async data => { await action(data); }} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Código<input name="code" required minLength={3} maxLength={32} className="input uppercase" placeholder="BEMVINDO10" /></label>
      <label className="text-sm font-medium">Tipo<select name="type" value={type} onChange={e => setType(e.target.value)} className="input"><option value="PERCENT">Percentual (%)</option><option value="FIXED">Valor fixo (R$)</option><option value="FREE_SHIPPING">Frete grátis</option></select></label>
      {type !== 'FREE_SHIPPING' && <label className="text-sm font-medium">{type === 'PERCENT' ? 'Percentual' : 'Valor'}<input name="value" required inputMode="decimal" className="input" /></label>}
      <label className="text-sm font-medium">Pedido mínimo (R$)<input name="minSubtotal" inputMode="decimal" className="input" /></label>
      <label className="text-sm font-medium">Limite de usos<input name="maxUses" inputMode="numeric" className="input" placeholder="Sem limite" /></label>
      <label className="flex items-end gap-2 pb-2 text-sm font-medium"><input type="checkbox" name="oncePerCustomer" /> Um uso por cliente</label>
      <label className="text-sm font-medium">Começa em<input name="startsAt" type="datetime-local" className="input" /></label>
      <label className="text-sm font-medium">Termina em<input name="endsAt" type="datetime-local" className="input" /></label>
      <div className="sm:col-span-2">
        {state.error && <p role="alert" className="mb-3 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="mb-3 text-sm text-emerald-700">{state.ok}</p>}
        <button className="button disabled:opacity-60" disabled={pending}>Criar cupom</button>
      </div>
    </form>
  );
}
