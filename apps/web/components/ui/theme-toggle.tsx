'use client';
import { useEffect, useState } from 'react';

const KEY = 'storeos-theme';
type Theme = 'light' | 'dark';

/** Aplica o tema na raiz do painel (elemento com data-theme-root) e guarda a escolha neste navegador. */
function apply(theme: Theme) {
  document.querySelector('[data-theme-root]')?.classList.toggle('dark', theme === 'dark');
}

export function initialThemeScript() {
  return `try{var t=localStorage.getItem('${KEY}');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.querySelector('[data-theme-root]').classList.add('dark')}catch(e){}`;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setTheme(document.querySelector('[data-theme-root]')?.classList.contains('dark') ? 'dark' : 'light'); }, []);
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* navegação privada: o tema vale só nesta sessão */ }
  }
  return (
    <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
      {theme === 'dark'
        ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}
