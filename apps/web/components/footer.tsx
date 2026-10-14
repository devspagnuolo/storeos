'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Category, PageLink } from '../lib/api';
import { useStoreBrand } from './store-name';

/** Rodapé da vitrine. Fica de fora do painel e do checkout, que têm o próprio foco. */
export function Footer({ categories, pages = [] }: { categories: Category[]; pages?: PageLink[] }) {
  const { name } = useStoreBrand();
  const pathname = usePathname();
  if (/^\/(admin|painel|checkout)(\/|$)/.test(pathname)) return null;
  const link = 'hover:text-brand';
  return (
    <footer className="border-t border-slate-200 bg-surface">
      <div className="shell grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <p className="text-lg font-black tracking-tight">{name}</p>
          <p className="mt-3 text-sm text-slate-500">Compre online com entrega para todo o Brasil e pagamento por PIX.</p>
        </div>
        <nav aria-label="Categorias">
          <p className="text-sm font-semibold">Categorias</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/categorias" className={link}>Todos os produtos</Link></li>
            {categories.slice(0, 6).map(category => <li key={category.id}><Link href={`/categorias/${category.slug}`} className={link}>{category.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Minha compra">
          <p className="text-sm font-semibold">Minha compra</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/carrinho" className={link}>Carrinho</Link></li>
            <li><Link href="/busca" className={link}>Buscar produtos</Link></li>
            <li><Link href="/conta" className={link}>Minha conta</Link></li>
            {pages.filter(page => page.showInFooter).map(page => <li key={page.slug}><Link href={`/p/${page.slug}`} className={link}>{page.title}</Link></li>)}
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold">Pagamento e entrega</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>PIX com confirmação rápida</li>
            <li>Frete calculado pelo CEP</li>
            <li>Compra sem cadastro</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-5 text-center text-xs text-slate-400">© {new Date().getFullYear()} {name}. Todos os direitos reservados.</div>
    </footer>
  );
}
