'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const groups = [
  { label: 'Minha operação', items: [['/painel', 'Visão geral'], ['/painel/primeiros-passos', 'Primeiros passos'], ['/painel/pedidos', 'Pedidos'], ['/painel/produtos', 'Produtos']] },
  { label: 'Minha loja', items: [['/painel/site', 'Personalizar loja'], ['/painel/frete', 'Entregas'], ['/painel/pagamentos', 'Pagamentos'], ['/painel/configuracoes', 'Configurações']] },
];

export function PanelNavigation() {
  const pathname = usePathname().replace(/^\/admin(?=\/|$)/, '/painel');
  return <nav aria-label="Navegação do painel" className="flex gap-6 overflow-x-auto p-4 md:block md:space-y-8 md:p-6">{groups.map(group => <div key={group.label} className="shrink-0"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.label}</p><ul className="flex gap-2 md:block md:space-y-1">{group.items.map(([href, label]) => {
    const active = pathname === href || (href !== '/painel' && pathname.startsWith(href + '/'));
    return <li key={href}><Link href={href} aria-current={active ? 'page' : undefined} className={'block whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ' + (active ? 'bg-violet-50 text-brand' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950')}>{label}</Link></li>;
  })}</ul></div>)}</nav>;
}
