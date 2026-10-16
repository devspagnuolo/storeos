import { PageForm } from '../../../../components/admin/page-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminPage } from '../../../../lib/admin/types';
import { deletePageAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PagesPage() {
  const pages = await adminFetch<AdminPage[]>('/content/admin/pages');
  return (
    <>
      <h1 className="text-3xl font-bold">Páginas</h1>
      <p className="mt-1 text-sm text-slate-500">Sobre nós, trocas e devoluções, privacidade, contato… Escreva o texto aqui e publique quando estiver pronto. Cada página fica em /p/endereço e pode aparecer no rodapé.</p>
      <details className="card mt-8 p-6" open>
        <summary className="cursor-pointer text-lg font-bold">+ Nova página</summary>
        <div className="mt-5"><PageForm /></div>
      </details>
      <div className="mt-6 space-y-4">
        {pages.map(page => (
          <details key={page.id} className="card p-5">
            <summary className="cursor-pointer font-bold">{page.title} <span className="ml-2 text-xs font-normal text-slate-500">/p/{page.slug} · {page.published ? 'publicada' : 'rascunho'}</span></summary>
            <div className="mt-4"><PageForm page={page} /></div>
            <form action={deletePageAction} className="mt-3"><input type="hidden" name="id" value={page.id} /><button className="text-xs text-red-700 underline">Excluir página</button></form>
          </details>))}
        {!pages.length && <p className="card p-8 text-center text-slate-500">Nenhuma página ainda.</p>}
      </div>
    </>
  );
}
