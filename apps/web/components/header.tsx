'use client';
import Link from 'next/link';
import { CartLink } from './cart-link';
import { SearchBox } from './search-box';
import { useStoreBrand } from './store-name';

export function Header() {
  const { name, logoUrl } = useStoreBrand();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-surface/95 backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-3 text-xl font-black tracking-tight" aria-label={`${name}: página inicial`}>
          {logoUrl ? <img src={logoUrl} alt={name} className="max-h-10 max-w-40 object-contain" /> : name}
        </Link>
        <SearchBox className="hidden max-w-md flex-1 md:block" />
        <div className="flex shrink-0 items-center gap-3">
          <nav aria-label="Principal" className="hidden gap-5 text-sm font-medium lg:flex"><Link href="/categorias" className="hover:text-brand">Produtos</Link></nav>
          <Link href="/conta" className="text-sm font-medium hover:text-brand">Entrar</Link>
          <CartLink />
        </div>
      </div>
      <div className="shell pb-3 md:hidden"><SearchBox /></div>
    </header>
  );
}
