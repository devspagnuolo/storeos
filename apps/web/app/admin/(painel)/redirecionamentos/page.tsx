import { RedirectForms } from '../../../../components/admin/redirect-forms';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminRedirect } from '../../../../lib/admin/types';
import { deleteRedirectAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function RedirectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { items, total } = await adminFetch<{ items: AdminRedirect[]; total: number }>(`/redirects${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return (
    <>
      <h1 className="text-3xl font-bold">Endereços antigos (301)</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">Quando alguém (ou o Google) abre um endereço antigo, a loja leva para o novo com um redirecionamento permanente. Assim você não perde a posição que já conquistou no Google nem deixa clientes em páginas que não existem mais. Os endereços que a própria loja já usa (produto, categorias, painel…) não podem ser redirecionados.</p>
      <div className="mt-6"><RedirectForms /></div>
      <section className="card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Cadastrados ({total})</h2>
          <form className="flex gap-2 text-sm"><input name="q" defaultValue={q} placeholder="Buscar endereço" className="input" /><button className="button">Buscar</button></form>
        </div>
        {items.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhum redirecionamento ainda.</p> : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-2 pr-4">Endereço antigo</th><th className="py-2 pr-4">Leva para</th><th className="py-2 pr-4">Acessos</th><th /></tr></thead>
            <tbody className="divide-y">{items.map(item => (
              <tr key={item.id}>
                <td className="py-2 pr-4 font-mono text-xs">{item.fromPath}</td>
                <td className="py-2 pr-4 font-mono text-xs">{item.toPath}</td>
                <td className="py-2 pr-4 text-xs text-slate-500">{item.hits}{item.lastHitAt ? ` · último em ${formatDateTime(item.lastHitAt)}` : ''}</td>
                <td className="py-2 text-right"><form action={deleteRedirectAction}><input type="hidden" name="id" value={item.id} /><button className="text-xs text-red-700 underline">Excluir</button></form></td>
              </tr>))}</tbody>
          </table>)}
        {total > items.length && <p className="mt-2 text-xs text-slate-400">Mostrando os {items.length} mais acessados. Use a busca para achar os outros.</p>}
      </section>
    </>
  );
}
