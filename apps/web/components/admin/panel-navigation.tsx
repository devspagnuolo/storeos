'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const icons = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  orders: 'M6 2h12l2 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7zM4 7h16M9 11h6',
  products: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.6-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 8h.01',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
} as const;
type Icon = keyof typeof icons;

const groups: { label: string; items: [href: string, label: string, icon: Icon][] }[] = [
  { label: 'Hoje', items: [['/painel', 'Visão geral', 'home'], ['/painel/primeiros-passos', 'Primeiros passos', 'flag']] },
  { label: 'Vendas', items: [['/painel/pedidos', 'Pedidos', 'orders'], ['/painel/clientes', 'Clientes', 'users'], ['/painel/relatorios', 'Relatórios', 'chart']] },
  { label: 'Catálogo', items: [['/painel/produtos', 'Produtos', 'products'], ['/painel/estoque', 'Estoque', 'products'], ['/painel/categorias', 'Categorias', 'tag'], ['/painel/colecoes', 'Coleções e marcas', 'tag']] },
  { label: 'Loja', items: [['/painel/cupons', 'Cupons', 'tag'], ['/painel/promocoes', 'Promoções', 'tag'], ['/painel/site', 'Personalizar loja', 'palette'], ['/painel/paginas', 'Páginas', 'doc'], ['/painel/emails', 'E-mails', 'doc'], ['/painel/frete', 'Entregas', 'truck'], ['/painel/pagamentos', 'Pagamentos', 'card']] },
  { label: 'Sistema', items: [['/painel/configuracoes', 'Configurações', 'gear'], ['/painel/seguranca', 'Segurança', 'shield'], ['/painel/auditoria', 'Auditoria', 'shield']] },
];

export function PanelNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname().replace(/^\/admin(?=\/|$)/, '/painel');
  return (
    <nav aria-label="Navegação do painel" className="space-y-6 p-4">
      {groups.map(group => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
          <ul className="space-y-1">
            {group.items.map(([href, label, icon]) => {
              const active = pathname === href || (href !== '/painel' && pathname.startsWith(href + '/'));
              return (
                <li key={href}>
                  <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ' + (active ? 'bg-violet-50 text-brand' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[icon]} /></svg>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
