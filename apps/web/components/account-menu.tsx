'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '../app/conta/actions';

function UserIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20.5c.9-3.9 4.2-6.3 8-6.3s7.1 2.4 8 6.3" />
    </svg>
  );
}

const item = 'block whitespace-nowrap rounded-lg px-3 py-2 text-left text-[15px] hover:bg-slate-100 hover:text-brand';

/** Ícone "Minha conta" com menu: criar conta e iniciar sessão, ou pedidos e sair quando já entrou. */
export function AccountMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 hover:text-brand">
        <UserIcon className="h-6 w-6 sm:h-7 sm:w-7" />
        <span className="text-[11px] font-medium sm:text-xs">Minha conta</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-50 mt-2 w-56 p-2 shadow-xl">
          {signedIn ? <>
            <Link role="menuitem" href="/conta" className={item}>Meus pedidos e dados</Link>
            <form action={logoutAction}><button role="menuitem" className={`${item} w-full`}>Sair</button></form>
          </> : <>
            <Link role="menuitem" href="/conta?criar=1" className={item}>Criar uma conta</Link>
            <Link role="menuitem" href="/conta" className={item}>Iniciar sessão</Link>
          </>}
        </div>
      )}
    </div>
  );
}
