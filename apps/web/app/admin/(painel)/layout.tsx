import type { Metadata } from 'next';
import Link from 'next/link';
import { logoutAction } from '../actions';
import { PanelNavigation } from '../../../components/admin/panel-navigation';

export const metadata: Metadata = { title: 'Painel | STOREOS', robots: { index: false } };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">
    <a href="#panel-content" className="sr-only focus:not-sr-only focus:block focus:bg-white focus:p-3">Ir para o conteúdo</a>
    <header className="border-b bg-white"><div className="flex min-h-16 items-center justify-between gap-4 px-5 md:px-8">
      <Link href="/painel" className="text-xl font-black tracking-tight">STORE<span className="text-brand">OS</span> <span className="text-sm font-medium text-slate-400">painel</span></Link>
      <div className="flex items-center gap-5 text-sm"><Link href="/" className="font-medium text-brand">Ver loja ↗</Link><form action={logoutAction}><button className="font-medium text-slate-500 hover:text-slate-950">Sair</button></form></div>
    </div></header>
    <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b bg-white md:min-h-[calc(100vh-65px)] md:border-b-0 md:border-r"><PanelNavigation /></aside>
      <main id="panel-content" className="min-w-0 px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl">{children}</div></main>
    </div>
  </div>;
}
