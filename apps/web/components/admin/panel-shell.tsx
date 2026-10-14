'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ThemeToggle, initialThemeScript } from '../ui/theme-toggle';
import { PanelNavigation } from './panel-navigation';

/** Moldura do painel: menu lateral fixo no desktop, gaveta no celular, barra superior com tema e saída. */
export function PanelShell({ storeName, logoUrl, logout, children }: { storeName: string; logoUrl: string | null; logout: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const brand = (
    <Link href="/painel" className="flex min-w-0 items-center gap-3" aria-label={`${storeName}: visão geral`}>
      {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" /> : <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-fg">{storeName.slice(0, 1).toUpperCase()}</span>}
      <span className="truncate text-sm font-bold">{storeName}</span>
    </Link>
  );

  return (
    <div data-theme-root suppressHydrationWarning className="min-h-screen bg-slate-50 text-slate-900">
      <script dangerouslySetInnerHTML={{ __html: initialThemeScript() }} />
      <a href="#panel-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">Ir para o conteúdo</a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">{brand}</div>
        <div className="flex-1 overflow-y-auto"><PanelNavigation /></div>
        <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400">STOREOS</p>
      </aside>

      {open && <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
        <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
        <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">{brand}<button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button></div>
          <div className="flex-1 overflow-y-auto"><PanelNavigation onNavigate={() => setOpen(false)} /></div>
        </div>
      </div>}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="lg:hidden min-w-0">{brand}</div>
          <div className="ml-auto flex items-center gap-1 text-sm sm:gap-3">
            <Link href="/" target="_blank" rel="noopener" className="rounded-lg px-3 py-2 font-medium text-brand hover:bg-violet-50">Ver loja ↗</Link>
            <ThemeToggle />
            {logout}
          </div>
        </header>
        <main id="panel-content" className="min-w-0 px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl">{children}</div></main>
      </div>
    </div>
  );
}
