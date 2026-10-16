import Link from 'next/link';
import type { Facets } from '../lib/api';
import { formatPrice } from '../lib/format';
import { type ActiveFilters, filterCount, urlFilters } from '../lib/product-filters';

const query = (params: Record<string, string | string[]>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of [value].flat()) if (item) search.append(key, item);
  const text = search.toString();
  return text ? `?${text}` : '';
};

/**
 * Filtros da lista de produtos (tamanho, cor e outros atributos das variações, faixa de preço).
 * Formulário comum (GET): funciona sem JavaScript e o link filtrado pode ser compartilhado.
 */
export function ProductFilters({ facets, filters, basePath, keep = {} }: { facets: Facets; filters: ActiveFilters; basePath: string; keep?: Record<string, string> }) {
  const count = filterCount(filters);
  if (!facets.attributes.length && !facets.price && !count) return null;
  const isOn = (name: string, value: string) => filters.selected.some(f => f.name === name && f.value.toLowerCase() === value.toLowerCase());
  const without = (name?: string, value?: string, price = false) => `${basePath}${query({ ...keep, ...urlFilters({ selected: filters.selected.filter(f => !(f.name === name && f.value === value)), ...(!price && { min: filters.min, max: filters.max }) }) })}`;
  return (
    <div>
      <details className="card group" open={count > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
          <span>Filtrar{count > 0 && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">{count}</span>}</span>
          <span aria-hidden className="text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>
        <form action={basePath} className="border-t border-slate-200 p-4">
          {Object.entries(keep).map(([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />)}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {facets.attributes.map(attribute => (
              <fieldset key={attribute.name} className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">{attribute.name}</legend>
                <div className="flex flex-wrap gap-2">
                  {attribute.values.map(value => (
                    <label key={value} className="cursor-pointer">
                      <input type="checkbox" name="filtro" value={`${attribute.name}:${value}`} defaultChecked={isOn(attribute.name, value)} className="peer sr-only" />
                      <span className="inline-flex min-h-9 items-center rounded-xl border border-slate-300 px-3 text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-fg peer-focus-visible:ring-2 peer-focus-visible:ring-brand">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {facets.price && (
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Preço</legend>
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1 text-xs text-slate-500">De (R$)<input name="min" inputMode="decimal" defaultValue={filters.min ?? ''} placeholder={String(facets.price.min)} className="input" /></label>
                  <label className="min-w-0 flex-1 text-xs text-slate-500">Até (R$)<input name="max" inputMode="decimal" defaultValue={filters.max ?? ''} placeholder={String(facets.price.max)} className="input" /></label>
                </div>
              </fieldset>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="button">Aplicar filtros</button>
            {count > 0 && <Link href={`${basePath}${query(keep)}`} className="button-ghost">Limpar filtros</Link>}
          </div>
        </form>
      </details>
      {count > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Filtros aplicados">
          {filters.selected.map(f => <li key={`${f.name}:${f.value}`}><Link href={without(f.name, f.value)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 hover:bg-slate-200">{f.name}: {f.value} <span aria-label="remover">×</span></Link></li>)}
          {(filters.min !== undefined || filters.max !== undefined) && <li><Link href={without(undefined, undefined, true)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 hover:bg-slate-200">Preço: {filters.min !== undefined ? formatPrice(filters.min) : 'até'}{filters.min !== undefined && filters.max !== undefined ? ' a ' : ' '}{filters.max !== undefined ? formatPrice(filters.max) : 'ou mais'} <span aria-label="remover">×</span></Link></li>}
        </ul>
      )}
    </div>
  );
}
