'use client';
import { useActionState } from 'react';
import { saveOrderAutomationAction } from '../../app/admin/actions';
import type { OrderAutomation as Settings } from '../../lib/admin/types';

const STEPS = [
  'Pagamento aprovado (PIX, cartão ou boleto) → pedido vai para "Em separação".',
  'A nota fiscal é emitida no Bling e o pedido fica "Faturado".',
  'A etiqueta dos Correios é comprada no SuperFrete com o saldo da conta; a cliente recebe o e-mail com o rastreio.',
  'Quando os Correios entregam, o pedido vira "Entregue" e a cliente recebe o e-mail de entrega.',
];

/** Liga o fluxo automático do pedido pago e guarda o remetente que vai nas etiquetas. */
export function OrderAutomation({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveOrderAutomationAction, {});
  const sender = settings.sender ?? {};
  const field = (name: keyof NonNullable<Settings['sender']>, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block font-medium">{label}<input name={name} defaultValue={sender[name] ?? ''} className="input" {...extra} /></label>
  );
  return (
    <form action={action} className="card mt-6 max-w-2xl p-6 text-sm">
      <h2 className="text-lg font-bold">Automação de pedidos</h2>
      <p className="mt-1 text-slate-600">Com ela ligada, todo pedido pago segue sozinho:</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">{STEPS.map(step => <li key={step}>{step}</li>)}</ol>
      <ul className="mt-3 space-y-1 text-xs">
        <li className={settings.bling ? 'text-emerald-700' : 'text-amber-800'}>{settings.bling ? '✓ Bling conectado (nota fiscal).' : 'Bling não conectado: a nota fiscal precisa ser lançada à mão.'}</li>
        <li className={settings.superFrete ? 'text-emerald-700' : 'text-amber-800'}>{settings.superFrete ? '✓ SuperFrete configurado (etiquetas). Mantenha saldo na conta SuperFrete.' : 'SuperFrete não configurado no servidor: as etiquetas ficam manuais.'}</li>
        <li className="text-slate-500">Frete por regra própria da loja (sem Correios/SuperFrete) não gera etiqueta automática.</li>
      </ul>
      <label className="mt-4 flex items-center gap-2 font-medium"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Ligar a automação</label>

      <h3 className="mt-6 font-bold">Remetente das etiquetas</h3>
      <p className="mt-1 text-xs text-slate-500">Sai impresso na etiqueta. O CEP é o de origem cadastrado acima.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field('name', 'Nome ou razão social', { autoComplete: 'organization' })}
        {field('document', 'CPF ou CNPJ', { inputMode: 'numeric' })}
        {field('street', 'Rua', { autoComplete: 'address-line1' })}
        <div className="grid grid-cols-2 gap-3">{field('number', 'Número')}{field('complement', 'Complemento')}</div>
        {field('district', 'Bairro')}
        <div className="grid grid-cols-[1fr_5rem] gap-3">{field('city', 'Cidade', { autoComplete: 'address-level2' })}{field('state', 'UF', { maxLength: 2, placeholder: 'SP' })}</div>
        {field('phone', 'Telefone (opcional)', { inputMode: 'tel', autoComplete: 'tel' })}
      </div>
      {settings.missing.length > 0 && <p className="mt-3 text-xs text-amber-800">Falta para as etiquetas: {settings.missing.join(', ')}.</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar automação'}</button>
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
