'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { apiUrl, storeSlug, type ProductSummary } from '../lib/api';
import { formatPrice } from '../lib/format';

/** Busca com sugestões: consulta o catálogo público a cada pausa na digitação e navega pelo teclado (combobox ARIA). */
export function SearchBox({ className = '' }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setItems([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${apiUrl}/catalog/products?store=${encodeURIComponent(storeSlug)}&q=${encodeURIComponent(term)}&pageSize=5`, { signal: controller.signal });
        if (response.ok) { setItems((await response.json()).items ?? []); setActive(-1); }
      } catch { /* sem sugestões: o envio do formulário continua funcionando */ }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => (i + 1) % items.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => (i <= 0 ? items.length - 1 : i - 1)); }
    if (event.key === 'Enter' && active >= 0) { event.preventDefault(); setOpen(false); router.push(`/produto/${items[active].slug}`); }
  }

  const showList = open && query.trim().length >= 2 && items.length > 0;
  return (
    <div ref={box} className={`relative ${className}`}>
      <form action="/busca" role="search" onSubmit={() => setOpen(false)}>
        <input
          name="q" value={query} autoComplete="off" placeholder="Buscar produtos" aria-label="Buscar produtos"
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          className="w-full rounded-full border border-slate-300 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:bg-surface"
        />
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </form>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-lg">
          {items.map((item, index) => (
            <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <Link href={`/produto/${item.slug}`} onClick={() => setOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${index === active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                {item.images?.[0] ? <img src={item.images[0].url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="font-semibold">{formatPrice(item.price)}</span>
              </Link>
            </li>
          ))}
          <li role="presentation"><Link href={`/busca?q=${encodeURIComponent(query.trim())}`} onClick={() => setOpen(false)} className="block border-t border-slate-200 px-3 py-2.5 text-center text-sm font-medium text-brand hover:bg-slate-50">Ver todos os resultados</Link></li>
        </ul>
      )}
    </div>
  );
}
