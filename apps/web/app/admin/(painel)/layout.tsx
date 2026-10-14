import type { Metadata } from 'next';
import { PanelShell } from '../../../components/admin/panel-shell';
import { getStore } from '../../../lib/api';
import { logoutAction } from '../actions';

export const metadata: Metadata = { title: { default: 'Painel', template: '%s | Painel' }, robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const store = await getStore();
  const logout = <form action={logoutAction}><button className="rounded-lg px-3 py-2 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900">Sair</button></form>;
  return <PanelShell storeName={store.name} logoUrl={store.logoUrl} logout={logout}>{children}</PanelShell>;
}
