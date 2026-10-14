import Link from 'next/link';
import { ShippingTest } from '../../../../components/admin/shipping-test';
import { adminFetch } from '../../../../lib/admin/session';
import type { Diagnostics } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

const STATUS = {
  ok: { label: 'OK', style: 'bg-emerald-100 text-emerald-800' },
  warn: { label: 'Atenção', style: 'bg-amber-100 text-amber-800' },
  fail: { label: 'Falha', style: 'bg-red-100 text-red-800' },
  off: { label: 'Desligado', style: 'bg-slate-100 text-slate-600' },
  manual: { label: 'Conferir à mão', style: 'bg-sky-100 text-sky-800' },
} as const;

export default async function DiagnosticsPage() {
  const report = await adminFetch<Diagnostics>('/diagnostics');
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
