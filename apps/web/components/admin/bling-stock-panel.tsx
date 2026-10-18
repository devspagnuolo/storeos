'use client';
import { useState, useTransition } from 'react';
import { reconcileBlingAction, setBlingStockSyncAction, syncBlingStockAction } from '../../app/admin/actions';
import type { BlingReconciliation } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';

export function BlingStockPanel({ enabled, syncedAt, error }: { enabled: boolean; syncedAt: string | null; error: string | null }) {
  const [report, setReport] = useState<BlingReconciliation>();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string }>();
  const [pending, start] = useTransition();
  const check = () => start(async () => {
    setMessage(undefined);
    const result = await reconcileBlingAction();
    if (result.error) setMessage({ kind: 'error', text: result.error }); else setReport(result.report);
  });
  const sync = () => start(async () => {
    const result = await syncBlingStockAction();
    setMessage(result.error ? { kind: 'error', text: result.error } : { kind: 'ok', text: result.ok ?? '' });
    const refreshed = await reconcileBlingAction();
    if (refreshed.report) setReport(refreshed.report);
  });
  const s = report?.summary;
  return <div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={check} disabled={pending} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">{pending ? 'Consultando o Bling…' : 'Conferir com o Bling'}</button>
      <button type="button" onClick={() => { if (window.confirm('Copiar o saldo do Bling para a loja? O estoque atual será substituído (com registro no histórico de estoque).')) sync(); }} disabled={pending} className="button disabled:opacity-50">Sincronizar estoque agora</button>
      <form action={setBlingStockSyncAction} className="ml-auto flex items-center gap-2 text-sm">
        <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
        {enabled ? <><span className="badge bg-emerald-100 text-emerald-800">Ligada: na hora e conferência a cada 10 min</span><button className="text-xs text-red-700 underline">Desativar</button></> : <button className="rounded-lg border px-3 py-2 text-sm font-medium">Ativar sincronização automática</button>}
      </form>
    </div>
    {syncedAt && <p className="mt-2 text-xs text-slate-500">Última sincronização: {new Date(syncedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={'mt-3 text-sm ' + (message.kind === 'ok' ? 'text-emerald-700' : 'text-red-700')}>{message.text}</p>}
    {report && s && <div className="mt-4 text-sm">
      <p className="text-slate-600">{s.matched} produtos em comum, {s.inSync} idênticos · {s.stockDiffs} com estoque diferente · {s.priceDiffs} com preço diferente · {s.onlyInBling} só no Bling · {s.onlyOnSite} só na loja.{report.truncated && ' Lista limitada aos primeiros 3.000 produtos do Bling.'}</p>
      {report.stock.length > 0 && <Table title="Estoque diferente (Bling x loja)" head={['SKU', 'Produto', 'Bling', 'Loja', 'Reservado']} rows={report.stock.map(r => [r.sku, r.name, r.bling, r.site, r.reserved])} />}
      {report.price.length > 0 && <Table title="Preço diferente (a loja não altera preço sozinha: reimporte o produto)" head={['SKU', 'Produto', 'Bling', 'Loja']} rows={report.price.map(r => [r.sku, r.name, formatPrice(r.bling), formatPrice(r.site)])} />}
      {report.onlyInBling.length > 0 && <Table title="Ativos no Bling e ausentes na loja (use Importar produtos)" head={['SKU', 'Produto', 'Preço', 'Estoque']} rows={report.onlyInBling.map(r => [r.sku, r.name, formatPrice(r.price), r.stock])} />}
      {report.onlyOnSite.length > 0 && <Table title="Ativos na loja e ausentes no Bling" head={['SKU', 'Produto']} rows={report.onlyOnSite.map(r => [r.sku, r.name])} />}
    </div>}
  </div>;
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return <div className="mt-4 overflow-x-auto"><p className="font-medium">{title}</p><table className="mt-1 w-full min-w-[480px] text-left"><thead className="text-xs text-slate-500"><tr>{head.map(h => <th key={h} className="py-1 pr-3">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.slice(0, 50).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="py-1.5 pr-3">{cell}</td>)}</tr>)}</tbody></table>{rows.length > 50 && <p className="text-xs text-slate-500">Mostrando 50 de {rows.length}.</p>}</div>;
}
