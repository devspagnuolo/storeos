'use client';
import { useState, useTransition } from 'react';
import { saveAutomationAction } from '../../app/admin/actions';
import { automationTriggers } from '../../lib/admin/labels';
import type { AutomationAction, AutomationConditions, AutomationRule } from '../../lib/admin/types';

type Draft = AutomationAction & { key: number };
const blank = (type: AutomationAction['type']): AutomationAction => {
  switch (type) {
    case 'ADD_TAG': case 'REMOVE_TAG': return { type, tag: '' };
    case 'ADD_POINTS': return { type, points: 100 };
    case 'CREATE_COUPON': return { type, couponType: 'PERCENT', value: 10, validDays: 30, prefix: 'OBRIGADO' };
    case 'SEND_EMAIL': return { type, subject: '', body: '', requireOptIn: true };
  }
};
const actionLabel: Record<AutomationAction['type'], string> = { ADD_TAG: 'Etiquetar o cliente', REMOVE_TAG: 'Tirar uma etiqueta', ADD_POINTS: 'Dar pontos de fidelidade', CREATE_COUPON: 'Criar um cupom só dele', SEND_EMAIL: 'Enviar e-mail' };
const UNITS = { minutes: 1, hours: 60, days: 1440 } as const;

function splitDelay(minutes: number): { amount: number; unit: keyof typeof UNITS } {
  if (minutes && minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days' };
  if (minutes && minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours' };
  return { amount: minutes, unit: 'minutes' };
}

/** Monta uma automação: quando acontece, em que caso, quanto esperar e o que fazer (até 5 ações em ordem). */
export function AutomationForm({ rule, onDone }: { rule?: AutomationRule; onDone?: () => void }) {
  const initialDelay = splitDelay(rule?.delayMinutes ?? 0);
  const [name, setName] = useState(rule?.name ?? '');
  const [trigger, setTrigger] = useState(rule?.trigger ?? 'orders.order-paid.v1');
  const [cond, setCond] = useState<AutomationConditions>(rule?.conditions ?? {});
  const [amount, setAmount] = useState(initialDelay.amount);
  const [unit, setUnit] = useState<keyof typeof UNITS>(initialDelay.unit);
  const [actions, setActions] = useState<Draft[]>((rule?.actions ?? [blank('ADD_TAG')]).map((a, i) => ({ ...a, key: i })));
  const [counter, setCounter] = useState(10);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const patch = (key: number, changes: Partial<AutomationAction>) => setActions(list => list.map(a => (a.key === key ? ({ ...a, ...changes } as Draft) : a)));
  const num = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(',', '.')));

  const submit = () => {
    const payload = { name, trigger, conditions: Object.fromEntries(Object.entries(cond).filter(([, v]) => v !== undefined && v !== false)), delayMinutes: Math.round(amount * UNITS[unit]), actions: actions.map(a => { const copy: Partial<Draft> = { ...a }; delete copy.key; return copy; }) };
    start(async () => {
      const result = await saveAutomationAction(JSON.stringify(payload), rule?.id);
      setMessage(result);
      if (result.ok) { if (!rule) { setName(''); setActions([{ ...blank('ADD_TAG'), key: counter }]); setCounter(c => c + 1); } onDone?.(); }
    });
  };

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium">Nome da automação<input value={name} onChange={e => setName(e.target.value)} maxLength={80} className="input" placeholder="ex.: Cupom para quem compra pela primeira vez" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Quando<select value={trigger} onChange={e => setTrigger(e.target.value)} className="input">{Object.entries(automationTriggers).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="text-sm font-medium">Esperar antes de agir
          <div className="mt-1 flex gap-2"><input type="number" min={0} value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value) || 0))} className="input !mt-0 w-24" aria-label="Quanto esperar" />
            <select value={unit} onChange={e => setUnit(e.target.value as keyof typeof UNITS)} className="input !mt-0"><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>
        </div>
      </div>
      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Só se <span className="font-normal text-slate-400">(deixe em branco para valer sempre)</span></legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Pedido a partir de R$<input inputMode="decimal" value={cond.minTotal ?? ''} onChange={e => setCond({ ...cond, minTotal: num(e.target.value) })} className="input" /></label>
          <label className="text-sm">Pedido até R$<input inputMode="decimal" value={cond.maxTotal ?? ''} onChange={e => setCond({ ...cond, maxTotal: num(e.target.value) })} className="input" /></label>
          <label className="text-sm">Pagamento<select value={cond.paymentMethod ?? ''} onChange={e => setCond({ ...cond, paymentMethod: (e.target.value || undefined) as AutomationConditions['paymentMethod'] })} className="input"><option value="">Qualquer</option><option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option></select></label>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={Boolean(cond.firstPurchaseOnly)} onChange={e => setCond({ ...cond, firstPurchaseOnly: e.target.checked })} /> Só primeira compra</label>
        </div>
      </fieldset>
      <div className="space-y-3">
        <p className="text-sm font-medium">Então fazer, nesta ordem</p>
        {actions.map((a, index) => (
          <div key={a.key} className="rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
              <select value={a.type} onChange={e => setActions(list => list.map(x => (x.key === a.key ? { ...blank(e.target.value as AutomationAction['type']), key: a.key } : x)))} className="input !mt-0 max-w-xs">{(Object.keys(actionLabel) as AutomationAction['type'][]).map(t => <option key={t} value={t}>{actionLabel[t]}</option>)}</select>
              <button type="button" className="ml-auto text-xs text-red-700 underline" onClick={() => setActions(list => list.filter(x => x.key !== a.key))} disabled={actions.length === 1}>Remover</button>
            </div>
            {(a.type === 'ADD_TAG' || a.type === 'REMOVE_TAG') && <label className="mt-3 block text-sm">Etiqueta<input value={a.tag} onChange={e => patch(a.key, { tag: e.target.value })} className="input" placeholder="ex.: compra-grande" /></label>}
            {a.type === 'ADD_POINTS' && <label className="mt-3 block text-sm">Pontos<input type="number" min={1} value={a.points} onChange={e => patch(a.key, { points: Number(e.target.value) })} className="input w-40" /></label>}
            {a.type === 'CREATE_COUPON' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <label className="text-sm">Tipo<select value={a.couponType} onChange={e => patch(a.key, { couponType: e.target.value as 'PERCENT' | 'FIXED' })} className="input"><option value="PERCENT">Porcentagem</option><option value="FIXED">Valor em R$</option></select></label>
                <label className="text-sm">{a.couponType === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}<input inputMode="decimal" value={a.value} onChange={e => patch(a.key, { value: Number(e.target.value.replace(',', '.')) })} className="input" /></label>
                <label className="text-sm">Vale por (dias)<input type="number" min={1} value={a.validDays} onChange={e => patch(a.key, { validDays: Number(e.target.value) })} className="input" /></label>
                <label className="text-sm">Começo do código<input value={a.prefix} onChange={e => patch(a.key, { prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} maxLength={12} className="input" /></label>
                <p className="text-xs text-slate-500 sm:col-span-4">Cada cliente recebe um código único, de uso único (ex.: {a.prefix || 'CUPOM'}-K7M2QX). Use <code>{'{{cupom}}'}</code> no e-mail que vier depois.</p>
              </div>)}
            {a.type === 'SEND_EMAIL' && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">Assunto<input value={a.subject} onChange={e => patch(a.key, { subject: e.target.value })} maxLength={150} className="input" /></label>
                <label className="block text-sm">Mensagem<textarea value={a.body} onChange={e => patch(a.key, { body: e.target.value })} rows={6} maxLength={8000} className="input" /></label>
                <p className="text-xs text-slate-500">Pode usar: <code>{'{{nome}} {{loja}} {{pedido}} {{total}} {{cupom}} {{link_loja}}'}</code>. O link para sair da lista vai sempre no rodapé.</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.requireOptIn} onChange={e => patch(a.key, { requireOptIn: e.target.checked })} /> Enviar só para quem autorizou receber comunicações (recomendado para promoções)</label>
              </div>)}
          </div>))}
        {actions.length < 5 && <button type="button" className="button-ghost" onClick={() => { setActions(list => [...list, { ...blank('SEND_EMAIL'), key: counter }]); setCounter(c => c + 1); }}>+ Adicionar ação</button>}
      </div>
      {message.error && <p role="alert" className="text-sm text-red-700">{message.error}</p>}
      {message.ok && <p role="status" className="text-sm text-emerald-700">{message.ok}</p>}
      <button type="button" className="button disabled:opacity-60" disabled={pending} onClick={submit}>{pending ? 'Salvando…' : rule ? 'Salvar alterações' : 'Criar automação'}</button>
    </div>
  );
}
