'use client';
import { Fragment, useCallback, useEffect, useState, useTransition } from 'react';
import { importBlingSelectedAction } from '../../app/admin/actions';
import type { BlingCatalogItem, BlingCatalogPage } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';

/** Lista os cadastros ativos do Bling para marcar quais vão para a loja. As fotos são ajustadas ao tamanho padrão na importação. */
export function BlingPicker({ disabled, onStarted }: { disabled: boolean; onStarted: () => void }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [data, setData] = useState<BlingCatalogPage | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Map<number, BlingCatalogItem>>(new Map());
  const [update, setUpdate] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage: number, search: string) => {
    setLoading(true); setError('');
    const response = await fetch(`/admin/bling/produtos?${new URLSearchParams({ page: String(nextPage), ...(search && { q: search }) })}`, { cache: 'no-store' }).catch(() => undefined);
    const body = await response?.json().catch(() => undefined);
    if (!response?.ok) setError(body?.message ?? 'Não foi possível consultar o Bling agora.');
    else setData(body);
    setLoading(false);
  }, []);

  useEffect(() => { void load(page, term); }, [load, page, term]);

  const toggle = (item: BlingCatalogItem) => setPicked(current => { const next = new Map(current); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item); return next; });
  const selectable = (data?.items ?? []).filter(i => i.sku && (update || !i.inStore));
  const allMarked = selectable.length > 0 && selectable.every(i => picked.has(i.id));
  const toggleAll = () => setPicked(current => { const next = new Map(current); selectable.forEach(i => (allMarked ? next.delete(i.id) : next.set(i.id, i))); return next; });

  return (
    <div className="mt-6 border-t pt-6">
      <h3 className="font-bold">Escolher produtos do Bling</h3>
      <p className="mt-1 text-sm text-slate-500">Aparecem só os cadastros ativos no Bling. Marque os que quer trazer: nome, descrição, categoria, marca, medidas, variações, estoque e fotos vêm junto. As fotos são ajustadas automaticamente para 1000×1250 px (fundo branco), então não precisa editar uma a uma.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setTerm(q.trim()); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pelo nome" className="input w-64" />
        <button className="button-ghost">Buscar</button>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={update} onChange={e => setUpdate(e.target.checked)} /> Também atualizar os que já estão na loja</label>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {Boolean(data?.hidden) && <p className="mt-3 text-xs text-slate-500">{data!.hidden} cadastro(s) ficaram fora por ter código abaixo de {data!.codeFrom}.</p>}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="w-10 p-3"><input type="checkbox" checked={allMarked} onChange={toggleAll} aria-label="Marcar todos desta página" /></th><th className="p-3">Produto</th><th className="p-3">Código</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Estoque</th></tr></thead>
          <tbody>
            {(data?.items ?? []).map(item => {
              const locked = !item.sku || (item.inStore && !update);
              const variations = item.variations ?? [];
              return (
                <Fragment key={item.id}>
                <tr className={`${variations.length ? '' : 'border-b last:border-0'} ${locked ? 'opacity-60' : ''}`}>
                  <td className="p-3"><input type="checkbox" disabled={locked} checked={picked.has(item.id)} onChange={() => toggle(item)} aria-label={`Marcar ${item.name}`} /></td>
                  <td className="p-3"><div className="flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-12 w-10 rounded object-cover" loading="lazy" /> : <span className="h-12 w-10 rounded bg-slate-100" />}<div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-400">{[variations.length ? `${variations.length} variação(ões), vêm junto` : item.hasVariations && 'com variações', item.inStore ? 'já está na loja' : !item.sku && 'sem código (SKU) no Bling, não dá para importar'].filter(Boolean).join(' · ')}</p></div></div></td>
                  <td className="p-3 font-mono text-xs">{item.sku ?? '—'}</td><td className="p-3 text-right">{formatPrice(String(item.price))}</td><td className="p-3 text-right">{item.stock}</td>
                </tr>
                {/* Variações do pai: entram junto quando o pai é marcado, não são importadas sozinhas. */}
                {variations.map((v, i) => (
                  <tr key={v.id} className={`bg-slate-50/70 text-xs text-slate-600 ${i === variations.length - 1 ? 'border-b' : ''} ${locked ? 'opacity-60' : ''}`}>
                    <td />
                    <td className="py-1.5 pl-16 pr-3"><span className="text-slate-400">↳</span> {v.name}</td>
                    <td className="px-3 py-1.5 font-mono">{v.sku ?? '—'}</td><td /><td className="px-3 py-1.5 text-right">{v.stock}</td>
                  </tr>
                ))}
                </Fragment>);
            })}
            {data && !data.items.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum produto ativo encontrado.</td></tr>}
            {!data && loading && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Consultando o Bling…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button className="button-ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>← Anterior</button>
        <span className="text-slate-500">Página {page}{data?.total ? ` de ${Math.max(1, Math.ceil(data.total / data.pageSize))} · ${data.total} produto(s), por código` : ''}</span>
        <button className="button-ghost" disabled={!data?.hasMore || loading} onClick={() => setPage(page + 1)}>Próxima →</button>
        <span className="ml-auto text-slate-600">{picked.size} marcado(s)</span>
        <button className="button disabled:opacity-60" disabled={disabled || pending || !picked.size} onClick={() => start(async () => {
          const result = await importBlingSelectedAction([...picked.keys()], update ? 'update' : 'new');
          setMessage(result);
          if (result.ok) { setPicked(new Map()); onStarted(); }
        })}>Importar {picked.size ? `${picked.size} ` : ''}selecionado(s)</button>
      </div>
      {message.error && <p role="alert" className="mt-2 text-sm text-red-700">{message.error}</p>}
      {message.ok && <p className="mt-2 text-sm text-emerald-700">{message.ok}</p>}
      <p className="mt-2 text-xs text-slate-500">Ao importar, a sincronização de estoque com o Bling é ligada e já iguala o saldo dos produtos escolhidos; depois ela se repete sozinha a cada 10 minutos. Produtos que já estão na loja nunca têm preço e situação alterados; marcar “Também atualizar” renova nome, descrição, categorias e fotos (se ainda não tiverem).</p>
    </div>
  );
}
