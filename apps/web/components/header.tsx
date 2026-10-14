'use client';
import Link from 'next/link';
import type { MenuLink } from '../lib/api';
import { CartLink } from './cart-link';
import { SearchBox } from './search-box';
import { useStoreBrand, useStoreMenus } from './store-name';

/** Lista de links aninhada: o terceiro nível em diante vira recuo menor com filete, como no menu de referência. */
function SubList({ items, depth = 0 }: { items: MenuLink[]; depth?: number }) {
  return (
    <ul className={depth ? 'ml-1 mt-1 space-y-1 border-l border-slate-200 pl-3 text-[13px]' : 'space-y-2'}>
      {items.map(item => (
        <li key={`${item.href}-${item.label}`}>
          <Link href={item.href} className="block py-0.5 text-slate-700 hover:text-brand">{item.label}</Link>
          {item.children.length > 0 && <SubList items={item.children} depth={depth + 1} />}
        </li>))}
    </ul>
  );
}

/** Painel largo com uma coluna por subitem (título em negrito e, abaixo, os níveis seguintes). Na lista de um item comum, os subitens sem filhos ficam juntos numa coluna só. */
function MegaPanel({ item, headings }: { item: MenuLink; headings: boolean }) {
  const hasGroups = item.children.some(child => child.children.length > 0);
  const leaves = headings ? [] : item.children.filter(child => !child.children.length);
  const columns = headings ? item.children : item.children.filter(child => child.children.length > 0);
  return (
    <div className="invisible absolute inset-x-0 top-full z-40 border-t border-slate-200 bg-white opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 max-lg:hidden">
      <div className="shell max-h-[70vh] overflow-y-auto py-6">
        {headings || hasGroups ? (
          <div className="grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {leaves.length > 0 && <div><SubList items={leaves} /></div>}
            {columns.map(child => (
              <div key={`${child.href}-${child.label}`}>
                <Link href={child.href} className="block pb-2 text-sm font-bold tracking-wide hover:text-brand">{child.label}</Link>
                {child.children.length > 0 && <SubList items={child.children} />}
              </div>))}
          </div>
        ) : <SubList items={item.children} />}
      </div>
    </div>
  );
}

export function Header() {
  const { name, logoUrl } = useStoreBrand();
  const { main } = useStoreMenus();
  const items: MenuLink[] = [{ label: 'Ver Tudo', href: '/categorias', children: main }, ...main];
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
        <ul className="shell flex gap-1 lg:justify-center overflow-x-auto text-sm font-medium lg:overflow-visible">
          {items.map((item, index) => {
            const key = `${index}-${item.href}`;
            return (
              <li key={key} className="group">
                <Link href={item.href} className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 tracking-wide hover:text-brand">
                  {item.label}{item.children.length > 0 && <span aria-hidden className="text-[10px]">▾</span>}
                </Link>
                {item.children.length > 0 && <MegaPanel item={item} headings={index === 0} />}
              </li>);
          })}
        </ul>
      </nav>
    </header>
  );
}
