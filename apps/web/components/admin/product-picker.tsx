'use client';
import { useCallback, useEffect, useState } from 'react';
import { moveItem } from '../../lib/storefront-model';
import { formatPrice } from '../../lib/format';

type Item = { id: string; name: string; sku: string; price: string; status: string; imageUrl: string | null };
type Result = { items: Item[]; page: number; total: number; pageSize: number };

async function fetchProducts(params: Record<string, string>): Promise<Result | null> {
  const response = await fetch(`/admin/produtos-busca?${new URLSearchParams(params)}`, { cache: 'no-store' }).catch(() => undefined);
  return response?.ok ? response.json() : null;
}

const Thumb = ({ url }: { url: string | null }) => url ? <img src={url} alt="" className="h-12 w-10 shrink-0 rounded object-cover" loading="lazy" /> : <span className="h-12 w-10 shrink-0 rounded bg-slate-100" />;

/** Escolhe, ordena e remove produtos já cadastrados; a vitrine guarda só os ids, então o catálogo não se duplica. */
export function ProductPicker({ label, max, help, value, onChange }: { label: string; max: number; help?: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [known, setKnown] = useState<Record<string, Item>>({});
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const missing = value.filter(id => !known[id]);
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    void fetchProducts({ ids: missing.join(',') }).then(data => {
      if (alive && data) setKnown(current => ({ ...current, ...Object.fromEntries(data.items.map(item => [item.id, item])) }));
    });
    return () => { alive = false; };
  }, [missing.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = useCallback(async (nextPage: number, text: string) => {
    setLoading(true); setFailed(false);
    const data = await fetchProducts({ page: String(nextPage), ...(text && { q: text }) });
    if (data) { setResult(data); setKnown(current => ({ ...current, ...Object.fromEntries(data.items.map(item => [item.id, item])) })); } else setFailed(true);
    setLoading(false);
  }, []);
  useEffect(() => { if (open) void search(page, term); }, [open, page, term, search]);

  const add = (id: string) => { if (value.length < max && !value.includes(id)) onChange([...value, id]); };
  const lastPage = result ? Math.max(Math.ceil(result.total / result.pageSize), 1) : 1;

  return (
    <fieldset className="grid gap-3 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{label} <span className="font-normal text-slate-500">({value.length} de {max})</span></legend>
      {help && <p className="text-xs text-slate-500">{help}</p>}
      {value.length > 0 && <ul className="grid gap-2">{value.map((id, index) => {
        const item = known[id];
        return <li key={id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <Thumb url={item?.imageUrl ?? null} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item?.name ?? 'Produto não encontrado'}</p><p className="text-xs text-slate-500">{item ? `${item.sku} · ${formatPrice(item.price)}${item.status !== 'ACTIVE' ? ' · não publicado (não aparece na loja)' : ''}` : 'Foi removido do catálogo; tire da lista.'}</p></div>
          <div className="flex gap-1 text-sm">
            <button type="button" aria-label={`Subir ${item?.name ?? 'produto'}`} disabled={index === 0} onClick={() => onChange(moveItem(value, index, index - 1))} className="rounded border px-2 disabled:opacity-30">↑</button>
            <button type="button" aria-label={`Descer ${item?.name ?? 'produto'}`} disabled={index === value.length - 1} onClick={() => onChange(moveItem(value, index, index + 1))} className="rounded border px-2 disabled:opacity-30">↓</button>
            <button type="button" aria-label={`Remover ${item?.name ?? 'produto'}`} onClick={() => onChange(value.filter(x => x !== id))} className="rounded border px-2 text-red-700">✕</button>
          </div>
        </li>;
      })}</ul>}
      <div>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Fechar lista de produtos' : '+ Escolher produtos'}</button>
      </div>
      {open && <div className="grid gap-3 rounded-lg border border-violet-100 p-3">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setTerm(q.trim()); }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou código" className="input !mt-0 flex-1" />
          <button className="button-ghost">Buscar</button>
        </form>
        {failed && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os produtos agora.</p>}
        <ul className="grid max-h-72 gap-1 overflow-y-auto">
          {(result?.items ?? []).map(item => {
            const chosen = value.includes(item.id);
            return <li key={item.id} className="flex items-center gap-3 rounded p-1 hover:bg-slate-50">
              <Thumb url={item.imageUrl} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{item.name}</p><p className="text-xs text-slate-500">{item.sku} · {formatPrice(item.price)}</p></div>
              <button type="button" disabled={chosen || value.length >= max} onClick={() => add(item.id)} className="rounded border px-3 py-1 text-sm disabled:opacity-40">{chosen ? 'Escolhido' : 'Adicionar'}</button>
            </li>;
          })}
          {result && !result.items.length && <li className="p-4 text-center text-sm text-slate-500">Nenhum produto publicado encontrado.</li>}
          {!result && loading && <li className="p-4 text-center text-sm text-slate-500">Carregando…</li>}
        </ul>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className="button-ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>← Anterior</button>
          <span className="text-slate-500">Página {page} de {lastPage}</span>
          <button type="button" className="button-ghost" disabled={page >= lastPage || loading} onClick={() => setPage(page + 1)}>Próxima →</button>
        </div>
      </div>}
    </fieldset>
  );
}
