import Link from 'next/link';
import { ShippingTest } from '../../../../components/admin/shipping-test';
import { adminFetch } from '../../../../lib/admin/session';
import type { Diagnostics, EnvironmentReport } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

const STATUS = {
  ok: { label: 'OK', style: 'bg-emerald-100 text-emerald-800' },
  warn: { label: 'Atenção', style: 'bg-amber-100 text-amber-800' },
  fail: { label: 'Falha', style: 'bg-red-100 text-red-800' },
  off: { label: 'Desligado', style: 'bg-slate-100 text-slate-600' },
  manual: { label: 'Conferir à mão', style: 'bg-sky-100 text-sky-800' },
} as const;

export default async function DiagnosticsPage() {
  const [report, env] = await Promise.all([adminFetch<Diagnostics>('/diagnostics'), adminFetch<EnvironmentReport>('/diagnostics/environment')]);
  const groups = [...new Set(env.variables.map(v => v.group))];
  const missing = env.variables.filter(v => !v.set && v.importance !== 'optional');
  const areas = [...new Set(report.checks.map(check => check.area))];
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">Sistema</p>
      <h1 className="mt-2 text-3xl font-bold">Diagnóstico das integrações</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Mostra o que está funcionando, o que está desligado e o que precisa de ajuste. Segredos nunca aparecem aqui. Esta verificação não substitui uma compra de teste de ponta a ponta.</p>
      <section role="status" className={'mt-6 rounded-xl p-4 text-sm font-medium ' + (report.summary.fail ? 'bg-red-50 text-red-800' : report.summary.warn ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800')}>
        {report.summary.fail} falha(s), {report.summary.warn} aviso(s), {report.summary.ok} item(ns) OK · verificado em {new Date(report.checkedAt).toLocaleString('pt-BR')}
      </section>
      {areas.map(area => <section key={area} className="card mt-6 p-6" aria-label={area}>
        <h2 className="font-semibold">{area}</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {report.checks.filter(check => check.area === area).map(check => <li key={check.id} className="flex flex-wrap items-start gap-3 py-4">
            <span className={'rounded-full px-2.5 py-1 text-xs font-semibold ' + STATUS[check.status].style}>{STATUS[check.status].label}</span>
            <div className="min-w-0 flex-1"><h3 className="font-medium">{check.title}</h3><p className="text-sm text-slate-600">{check.detail}</p>{check.hint && <p className="mt-1 text-sm text-slate-500">{check.hint}</p>}</div>
          </li>)}
        </ul>
      </section>)}
      <section className="card mt-6 p-6" aria-label="Variáveis do servidor">
        <h2 className="font-semibold">Variáveis do servidor (API)</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Mostra só os nomes e se estão preenchidas; os valores nunca aparecem. “Não reconhecidas” são variáveis cadastradas na Render que o código não usa: podem ser sobra antiga ou erro de digitação.</p>
        {env.unrecognized.length > 0 && <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Não reconhecidas pelo código:</strong>
          <ul className="mt-1 list-disc pl-5">{env.unrecognized.map(v => <li key={v.name}><code>{v.name}</code>{v.suggestion ? <> — você quis dizer <code>{v.suggestion}</code>?</> : ' — nenhuma parte do sistema lê esta variável.'}</li>)}</ul></div>}
        {missing.length > 0 && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Faltam (obrigatórias ou recomendadas):</strong> {missing.map(v => v.name).join(', ')}</div>}
        {groups.map(group => <details key={group} className="border-t py-3 first:border-t-0">
          <summary className="cursor-pointer font-medium">{group} <span className="text-xs font-normal text-slate-500">({env.variables.filter(v => v.group === group && v.set).length}/{env.variables.filter(v => v.group === group).length} definidas)</span></summary>
          <ul className="mt-2 space-y-1 text-sm">{env.variables.filter(v => v.group === group).map(v => <li key={v.name} className="flex flex-wrap gap-x-3"><span className={v.set ? 'text-emerald-700' : v.importance === 'optional' ? 'text-slate-400' : 'text-red-700'}>{v.set ? '✓' : '○'}</span><code>{v.name}</code><span className="text-slate-500">{v.description}</span></li>)}</ul>
        </details>)}
        <p className="mt-4 text-xs text-slate-500">O site (storeos-nexo-web) tem as próprias variáveis, que esta tela não enxerga: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_STORE_SLUG e, se quiser, API_INTERNAL_URL (opcional).</p>
      </section>
      <section className="card mt-6 p-6" aria-label="Teste de frete">
        <h2 className="font-semibold">Testar cotação de frete</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Faz uma cotação real com o primeiro produto ativo e mostra o que o cliente veria no checkout.</p>
        <ShippingTest />
      </section>
      <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm text-slate-700"><h2 className="font-semibold">Roteiro da compra de teste</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5"><li>Adicione um produto barato ao carrinho e calcule o frete.</li><li>Pague com PIX (ou cartão) de verdade e confira o status do pedido no painel.</li><li>Verifique o e-mail de confirmação e o envio do pedido ao Bling.</li><li>Cancele ou reembolse pela operadora e confira o estoque devolvido.</li></ol>
        <Link href="/painel/primeiros-passos" className="mt-3 inline-block font-semibold text-brand">Voltar aos primeiros passos →</Link></div>
    </>
  );
}
