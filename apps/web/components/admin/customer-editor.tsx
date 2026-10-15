'use client';
import { useActionState } from 'react';
import { anonymizeCustomerAction, saveCustomerAction } from '../../app/admin/actions';
import type { CustomerProfile } from '../../lib/admin/types';

export function CustomerEditor({ customer }: { customer: CustomerProfile }) {
  const [state, action, pending] = useActionState(saveCustomerAction, {});
  const [removal, remove, removing] = useActionState(anonymizeCustomerAction, {});
  return (
    <aside className="space-y-6">
      <form action={action} className="card p-5">
        <input type="hidden" name="id" value={customer.id} />
        <h2 className="font-bold">Relacionamento</h2>
        <label className="mt-3 block text-sm font-medium">Telefone<input name="phone" maxLength={30} defaultValue={customer.phone ?? ''} className="input" /></label>
        <label className="mt-3 block text-sm font-medium">Etiquetas <span className="font-normal text-slate-400">(separadas por vírgula)</span><input name="tags" defaultValue={customer.tags.join(', ')} className="input" /></label>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" name="marketingOptIn" defaultChecked={customer.marketingOptIn} className="mt-1" /> Autorizou receber comunicações de marketing</label>
        {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="mt-3 text-sm text-emerald-700">{state.ok}</p>}
        <button className="button mt-4 disabled:opacity-60" disabled={pending}>Salvar</button>
      </form>
      <form action={remove} className="card p-5" onSubmit={e => { if (!confirm('Anonimizar este cliente? Nome, e-mail, telefone e endereços serão apagados e isso não pode ser desfeito. Os pedidos continuam registrados.')) e.preventDefault(); }}>
        <input type="hidden" name="id" value={customer.id} />
        <h2 className="font-bold">Privacidade (LGPD)</h2>
        <p className="mt-2 text-sm text-slate-600">Atende a um pedido de exclusão de dados pessoais. Os pedidos permanecem para fins fiscais, sem identificar a pessoa.</p>
        {removal.error && <p role="alert" className="mt-3 text-sm text-red-700">{removal.error}</p>}
        <button className="button-ghost mt-4 text-red-700 disabled:opacity-60" disabled={removing}>Anonimizar cliente</button>
      </form>
    </aside>
  );
}
