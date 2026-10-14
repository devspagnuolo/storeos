'use client';
import { useActionState, useState } from 'react';
import { createPromotionAction } from '../../app/admin/actions';

export function PromotionForm() {
  const [state, action, pending] = useActionState(createPromotionAction, {});
  const [type, setType] = useState('PERCENT_OFF');
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Nome<input name="name" required minLength={2} maxLength={80} className="input" placeholder="Leve 3 pague 2 nas camisetas" /></label>
      <label className="text-sm font-medium sm:col-span-2">Tipo
        <select name="type" value={type} onChange={e => setType(e.target.value)} className="input">
          <option value="PERCENT_OFF">Desconto percentual nos produtos</option>
          <option value="BUY_X_PAY_Y">Leve X pague Y</option>
          <option value="CART_PERCENT">Desconto no carrinho (acima de um valor)</option>
        </select>
      </label>
      {type === 'BUY_X_PAY_Y' ? (<>
        <label className="text-sm font-medium">Leve (X)<input name="buyQty" required inputMode="numeric" className="input" placeholder="3" /></label>
        <label className="text-sm font-medium">Pague (Y)<input name="payQty" required inputMode="numeric" className="input" placeholder="2" /></label>
      </>) : <label className="text-sm font-medium">Percentual (%)<input name="value" required inputMode="decimal" className="input" /></label>}
      {type === 'CART_PERCENT' && <label className="text-sm font-medium">Pedido mínimo (R$)<input name="minSubtotal" inputMode="decimal" className="input" /></label>}
      {type !== 'CART_PERCENT' && <label className="text-sm font-medium sm:col-span-2">SKUs dos produtos <span className="font-normal text-slate-400">(vazio = todos, separados por vírgula)</span><textarea name="skus" rows={2} className="input font-mono text-xs" /></label>}
      <label className="text-sm font-medium">Começa em<input name="startsAt" type="datetime-local" className="input" /></label>
      <label className="text-sm font-medium">Termina em<input name="endsAt" type="datetime-local" className="input" /></label>
      <div className="sm:col-span-2">
        {state.error && <p role="alert" className="mb-3 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="mb-3 text-sm text-emerald-700">{state.ok}</p>}
        <button className="button disabled:opacity-60" disabled={pending}>Criar promoção</button>
      </div>
    </form>
  );
}
