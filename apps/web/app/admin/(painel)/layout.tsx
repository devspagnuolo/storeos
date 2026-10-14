import type { Metadata } from 'next';
import Link from 'next/link';
import { logoutAction } from '../actions';

export const metadata: Metadata = { title: 'Painel | STOREOS', robots: { index: false } };

const nav = [['/admin', 'Visão geral'], ['/admin/pedidos', 'Pedidos'], ['/admin/produtos', 'Produtos'], ['/admin/frete', 'Frete'], ['/admin/configuracoes', 'Configurações']];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link href="/admin" className="text-xl font-black tracking-tight">STORE<span className="text-brand">OS</span> <span className="text-sm font-medium text-slate-400">painel</span></Link>
          <nav className="flex gap-5 text-sm font-medium">{nav.map(([href, label]) => <Link key={href} href={href} className="hover:text-brand">{label}</Link>)}</nav>
          <div className="flex items-center gap-4 text-sm"><Link href="/" className="text-slate-500 hover:text-brand">Ver loja</Link><form action={logoutAction}><button className="font-medium text-slate-500 hover:text-brand">Sair</button></form></div>
        </div>
      </header>
      <main className="shell py-10">{children}</main>
    </div>
  );
}
