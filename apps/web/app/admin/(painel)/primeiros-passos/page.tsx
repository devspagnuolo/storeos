import Link from 'next/link';
import { adminFetch } from '../../../../lib/admin/session';
import type { StoreSetup } from '../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const setup = await adminFetch<StoreSetup>('/store/setup');
  const progress = Math.round(setup.completed / setup.total * 100);
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">Primeiros passos</p>
      <h1 className="mt-2 text-3xl font-bold">Vamos preparar {setup.storeName} para vender</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Siga as etapas no seu ritmo. O progresso é atualizado automaticamente quando você configura sua loja.</p>
      <section className="card mt-8 p-6" aria-label="Progresso da configuração">
        <div className="flex justify-between gap-4"><h2 className="font-semibold">Sua loja tomando forma</h2><span className="text-sm text-slate-500">{setup.completed} de {setup.total} etapas</span></div>
        <progress value={setup.completed} max={setup.total} className="mt-4 h-3 w-full accent-violet-600" aria-label={progress + '% da configuração concluída'} />
        <ol className="mt-6 divide-y divide-slate-100">
          {setup.steps.map((step, index) => <li key={step.id} className="flex flex-wrap items-center gap-4 py-5">
            <span aria-hidden="true" className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold ' + (step.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{step.complete ? '✓' : index + 1}</span>
            <div className="min-w-0 flex-1"><h3 className="font-semibold">{step.title}<span className="sr-only">{step.complete ? ' — concluído' : ' — pendente'}</span></h3><p className="mt-1 text-sm text-slate-500">{step.description}</p></div>
            <Link href={step.href} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-violet-300 hover:text-brand">{step.complete ? 'Revisar' : 'Configurar'}</Link>
          </li>)}
        </ol>
      </section>
      <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm text-slate-700"><h2 className="font-semibold">Antes de divulgar</h2><p className="mt-2">Revise preços, fotos, disponibilidade, prazos e políticas comerciais. Faça uma compra de teste para conferir o checkout e o recebimento. Esta lista acompanha as configurações básicas e não substitui essa revisão.</p><Link href="/" className="mt-3 inline-block font-semibold text-brand">Abrir a loja →</Link></div>
    </>
  );
}
