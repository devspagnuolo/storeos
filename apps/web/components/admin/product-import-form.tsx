'use client';
import { useActionState } from 'react';
import { importProductsAction } from '../../app/admin/actions';

export function ProductImportForm() {
  const [state, action, pending] = useActionState(importProductsAction, {});
  const report = state.report;
  return (
    <form action={action} className="card mt-6 grid gap-4 p-5">
      <label className="text-sm font-medium">Planilha (CSV)<input type="file" name="file" accept=".csv,text/csv" required className="input" /></label>
      <div className="flex flex-wrap gap-3">
        <button name="mode" value="check" className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={pending}>1. Conferir sem gravar</button>
        <button name="mode" value="import" className="button disabled:opacity-60" disabled={pending}>2. Importar produtos</button>
      </div>
      {pending && <p className="text-sm text-slate-500">Lendo a planilha…</p>}
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {report && (
        <div className="grid gap-3 text-sm">
          <p className={`rounded-lg border p-3 ${report.failed ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            {report.dryRun ? 'Conferência (nada foi gravado): ' : 'Importação concluída: '}
            <strong>{report.created}</strong> {report.created === 1 ? 'produto novo' : 'produtos novos'}, <strong>{report.updated}</strong> atualizados e <strong>{report.failed}</strong> com problema, em {report.rows} linhas.
          </p>
          {report.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-red-700">{report.errors.slice(0, 50).map((e, i) => <li key={i}>Linha {e.line}: {e.message}</li>)}</ul>}
          {report.products.length > 0 && (
            <details><summary className="cursor-pointer font-medium">Ver os {report.products.length} produtos lidos</summary>
              <ul className="mt-2 grid gap-1 md:grid-cols-2">{report.products.slice(0, 200).map(p => <li key={p.slug}>{p.action === 'create' ? 'Novo' : p.action === 'update' ? 'Atualiza' : 'Erro'}: {p.name}{p.variants ? ` (${p.variants} variações)` : ''}</li>)}</ul>
            </details>)}
        </div>)}
    </form>
  );
}
