'use client';
import Link from 'next/link';
import { CartLink } from './cart-link';
import { SearchBox } from './search-box';
import { useStoreBrand, useStoreMenus } from './store-name';

export function Header() {
  const { name, logoUrl } = useStoreBrand();
  const { main } = useStoreMenus();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-surface/95 backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-3 text-xl font-black tracking-tight" aria-label={`${name}: página inicial`}>
          {logoUrl ? <img src={logoUrl} alt={name} className="max-h-10 max-w-40 object-contain" /> : name}
        </Link>
        <SearchBox className="hidden max-w-md flex-1 md:block" />
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/conta" className="text-sm font-medium hover:text-brand">Entrar</Link>
          <CartLink />
        </div>
      </div>
      <div className="shell pb-3 md:hidden"><SearchBox /></div>
      <nav aria-label="Principal" className="border-t border-slate-100">
        <ul className="shell flex gap-1 overflow-x-auto text-sm font-medium lg:overflow-visible">
          <li><Link href="/categorias" className="block whitespace-nowrap px-3 py-2.5 hover:text-brand">Todos os produtos</Link></li>
          {main.map(item => (
            <li key={`${item.href}-${item.label}`} className="group relative">
              <Link href={item.href} className="block whitespace-nowrap px-3 py-2.5 hover:text-brand">{item.label}{item.children.length > 0 && <span aria-hidden className="ml-1 text-xs">▾</span>}</Link>
              {item.children.length > 0 && (
                <ul className="invisible absolute left-0 top-full z-40 min-w-48 rounded-lg border border-slate-200 bg-white py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 max-lg:hidden">
                  {item.children.map(child => <li key={child.href}><Link href={child.href} className="block whitespace-nowrap px-4 py-2 hover:bg-slate-50 hover:text-brand">{child.label}</Link></li>)}
                </ul>
              )}
            </li>))}
        </ul>
      </nav>
    </header>
  );
}
