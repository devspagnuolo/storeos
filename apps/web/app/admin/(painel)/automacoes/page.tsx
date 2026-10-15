import { AutomationEdit } from '../../../../components/admin/automation-edit';
import { AutomationForm } from '../../../../components/admin/automation-form';
import { automationRunStatus, formatDateTime, formatDelay } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AutomationPreset, AutomationRule, AutomationRunRow } from '../../../../lib/admin/types';
import { deleteAutomationAction, toggleAutomationAction, usePresetAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const [rules, presets, runs] = await Promise.all([
    adminFetch<AutomationRule[]>('/automations'),
    adminFetch<AutomationPreset[]>('/automations/presets'),
    adminFetch<AutomationRunRow[]>('/automations/runs'),
  ]);
  return (
    <>
      <h1 className="text-3xl font-bold">Automações</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Regras do tipo “quando acontecer isto, faça aquilo”: etiquetar clientes, dar pontos, criar um cupom só para a pessoa e mandar e-mail, na hora ou dias depois. Cada acontecimento dispara a regra uma única vez.</p>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Modelos prontos</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {presets.map(p => (
            <form key={p.key} action={usePresetAction} className="card p-5"><input type="hidden" name="key" value={p.key} />
              <h3 className="font-semibold">{p.title}</h3><p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <button className="button-ghost mt-3">Usar este modelo</button>
            </form>))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Os modelos entram desligados, para você conferir o texto e ligar quando quiser.</p>
      </section>

      <section className="card mt-8 overflow-x-auto">
        <h2 className="p-5 text-lg font-bold">Suas automações</h2>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Automação</th><th className="p-3">Quando</th><th className="p-3">O que faz</th><th className="p-3 text-right">Execuções</th><th className="p-3" /></tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="p-3 font-medium">{r.name}{!r.active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">desligada</span>}</td>
                <td className="p-3">{r.triggerLabel}<p className="text-xs text-slate-400">{formatDelay(r.delayMinutes)}{r.conditions.firstPurchaseOnly ? ' · só primeira compra' : ''}{r.conditions.minTotal !== undefined ? ` · a partir de R$ ${r.conditions.minTotal}` : ''}</p></td>
                <td className="p-3"><ul className="space-y-0.5">{r.summary.map((line, i) => <li key={i}>{line}</li>)}</ul></td>
                <td className="p-3 text-right text-xs text-slate-500">{r.runs.DONE} ok · {r.runs.PENDING} agendadas · {r.runs.FAILED} com erro · {r.runs.SKIPPED} puladas</td>
                <td className="p-3">
                  <div className="flex flex-col items-end gap-2">
                    <form action={toggleAutomationAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={String(!r.active)} /><button className={r.active ? 'button-ghost' : 'button'}>{r.active ? 'Desligar' : 'Ligar'}</button></form>
                    <AutomationEdit rule={r} />
                    <form action={deleteAutomationAction}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-red-700 underline">Excluir</button></form>
                  </div>
                </td>
              </tr>))}
            {!rules.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhuma automação ainda. Comece por um modelo pronto ou crie a sua abaixo.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-bold">Nova automação</h2>
        <div className="mt-4"><AutomationForm /></div>
      </section>

      <section className="card mt-8 overflow-x-auto">
        <h2 className="p-5 text-lg font-bold">Últimas execuções</h2>
        <table className="w-full min-w-[760px] text-left text-sm">
          <tbody>
            {runs.map(r => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-3 whitespace-nowrap text-slate-500">{formatDateTime(r.finishedAt ?? r.runAt)}</td>
                <td className="p-3 font-medium">{r.rule}</td>
                <td className="p-3">{r.customer ? <>{r.customer.name}<p className="text-xs text-slate-400">{r.customer.email}{r.orderNumber ? ` · pedido ${r.orderNumber}` : ''}</p></> : '—'}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${automationRunStatus[r.status][1]}`}>{automationRunStatus[r.status][0]}</span></td>
                <td className="p-3 text-xs text-slate-500">{r.result}</td>
              </tr>))}
            {!runs.length && <tr><td className="p-8 text-center text-slate-500">Nada executado ainda.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
