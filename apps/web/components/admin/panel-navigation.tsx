'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { activeHref, ALL_LINKS, NAV_SECTIONS } from '../../lib/panel-menu';

const icons = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  orders: 'M6 2h12l2 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7zM4 7h16M9 11h6',
  products: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1zM16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.6-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 8h.01',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  chevron: 'M9 6l6 6-6 6',
} as const;
type Icon = keyof typeof icons;

const STORAGE_KEY = 'storeos-panel-menu';
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Svg({ icon, size = 18, className }: { icon: Icon; size?: number; className?: string }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={icons[icon]} /></svg>;
}

export function PanelNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname().replace(/^\/admin(?=\/|$)/, '/painel');
  const current = activeHref(pathname);
  const currentSection = NAV_SECTIONS.find(section => section.items.some(([href]) => href === current))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentSection ? { [currentSection]: true } : {}));
  const [query, setQuery] = useState('');
  const baseId = useId();

  // Lembra quais seções ficaram abertas neste navegador; a da página atual sempre abre.
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* sem acesso ao armazenamento: usa o padrão */ }
    setOpen(prev => ({ ...prev, ...saved, ...(currentSection ? { [currentSection]: true } : {}) }));
  }, [currentSection]);

  function toggle(id: string) {
    setOpen(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* navegação privada */ }
      return next;
    });
  }

  const link = (href: string, label: string, hint?: string) => {
    const active = href === current;
    return <li key={href}>
      <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' + (active ? 'bg-violet-50 font-semibold text-brand' : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
        <span className="min-w-0 flex-1 truncate">{label}</span>{hint && <span className="shrink-0 text-xs font-normal text-slate-400">{hint}</span>}
      </Link>
    </li>;
  };

  const term = normalize(query.trim());
  const results = term ? ALL_LINKS.filter(item => normalize(item.label).includes(term) || normalize(item.section).includes(term)) : [];

  return (
    <nav aria-label="Navegação do painel" className="p-3">
      <div className="relative mb-3">
        <Svg icon="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={query} onChange={e => setQuery(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} placeholder="Buscar no menu" aria-label="Buscar no menu" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:bg-surface" />
      </div>

      {term ? <>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400" role="status">{results.length ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Nada encontrado'}</p>
        <ul className="space-y-0.5">{results.map(item => link(item.href, item.label, item.section))}</ul>
      </> : <ul className="space-y-1">
        {NAV_SECTIONS.map(section => {
          const expanded = Boolean(open[section.id]);
          const hasActive = section.id === currentSection;
          const panelId = `${baseId}-${section.id}`;
          return <li key={section.id}>
            <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(section.id)} className={'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-100 ' + (hasActive ? 'text-brand' : 'text-slate-700 hover:text-slate-900')}>
              <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' + (hasActive ? 'bg-violet-50' : 'bg-slate-100 text-slate-500')}><Svg icon={section.icon} size={16} /></span>
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <Svg icon="chevron" size={16} className={'shrink-0 text-slate-400 transition-transform ' + (expanded ? 'rotate-90' : '')} />
            </button>
            <ul id={panelId} hidden={!expanded} className="ml-[1.6rem] mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">{section.items.map(([href, label]) => link(href, label))}</ul>
          </li>;
        })}
      </ul>}
    </nav>
  );
}
