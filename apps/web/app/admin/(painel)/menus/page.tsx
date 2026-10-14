import Link from 'next/link';
import { resetMenuAction } from '../../actions';
import { MenuEditor } from '../../../../components/admin/menu-editor';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminMenu } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ menu?: string }> }) {
  const key = (await searchParams).menu === 'footer' ? 'footer' : 'main';
  const menu = await adminFetch<AdminMenu>(`/content/admin/menus/${key}`);
  const tab = (value: 'main' | 'footer', label: string) => <Link href={`/painel/menus?menu=${value}`} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${key === value ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white'}`}>{label}</Link>;
  return (
    <>
      <h1 className="text-3xl font-bold">Menus</h1>
      <p className="mt-1 text-sm text-slate-500">Monte o menu do topo e do rodapé da loja. Cada item pode levar a uma categoria, coleção, marca, página ou link, e os itens principais aceitam subitens.</p>
      <div className="mt-4 flex gap-2">{tab('main', 'Menu do topo')}{tab('footer', 'Menu do rodapé')}</div>
      {!menu.configured && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Você ainda não montou este menu. {key === 'main' ? 'A loja mostra suas categorias e subcategorias automaticamente.' : 'O rodapé mostra suas categorias principais.'} Salvar aqui substitui o padrão.</p>}
      <MenuEditor key={`${key}-${menu.configured}`} menu={menu} />
      {menu.configured && (
        <form action={resetMenuAction} className="mt-6"><input type="hidden" name="key" value={key} /><button className="text-sm text-red-700 underline">Voltar ao menu padrão</button></form>
      )}
    </>
  );
}
