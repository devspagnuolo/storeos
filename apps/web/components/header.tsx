'use client';
import Link from 'next/link';
import { CartLink } from './cart-link';
import { useStoreBrand } from './store-name';

export function Header() {
  const { name, logoUrl } = useStoreBrand();
  return (
    <header className="border-b bg-white">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 text-xl font-black tracking-tight" aria-label={name}>
          {logoUrl ? <img src={logoUrl} alt={name} className="max-h-10 max-w-40 object-contain" /> : name}
        </Link>
        <nav className="hidden gap-6 text-sm font-medium md:flex"><Link href="/categorias">Categorias</Link><Link href="/busca">Buscar</Link></nav>
        <div className="flex items-center gap-3"><Link href="/conta" className="text-sm font-medium">Entrar</Link><CartLink /></div>
      </div>
    </header>
  );
}
