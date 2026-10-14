import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { SubscriberPage } from '../../../../lib/admin/types';
import { unsubscribeAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function NewsletterPage() {
  const { items, total } = await adminFetch<SubscriberPage>('/engagement/admin/newsletter?pageSize=100');
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Newsletter</h1>
        <a href="/painel/newsletter/exportar" className="button">Baixar lista (CSV)</a>
      </div>
      <p className="mt-1 text-sm text-slate-500">Pessoas que deixaram o e-mail no rodapé da loja ({total} {total === 1 ? 'inscrito' : 'inscritos'}). Remover alguém atende o pedido de sair da lista.</p>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">E-mail</th><th className="p-3">Nome</th><th className="p-3">Inscrito em</th><th className="p-3" /></tr></thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-3">{s.email}</td><td className="p-3">{s.name ?? '—'}</td><td className="p-3 whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                <td className="p-3 text-right"><form action={unsubscribeAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-700 underline">Remover</button></form></td>
              </tr>))}
            {!items.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Ninguém se inscreveu ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > items.length && <p className="mt-3 text-xs text-slate-500">Mostrando os {items.length} mais recentes de {total}. A planilha traz todos.</p>}
    </>
  );
}
