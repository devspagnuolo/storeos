import Link from 'next/link';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminReviewPage } from '../../../../lib/admin/types';
import { deleteReviewAction, moderateReviewAction } from '../../actions';

export const dynamic = 'force-dynamic';

const TABS = [['PENDING', 'Para aprovar'], ['APPROVED', 'Aprovadas'], ['REJECTED', 'Recusadas']] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { status: raw, page: rawPage } = await searchParams;
  const status = TABS.some(([key]) => key === raw) ? (raw as 'PENDING' | 'APPROVED' | 'REJECTED') : 'PENDING';
  const page = Math.max(Number(rawPage) || 1, 1);
  const data = await adminFetch<AdminReviewPage>(`/reviews?status=${status}&page=${page}`);
  return (
    <>
      <h1 className="text-3xl font-bold">Avaliações</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">Quem comprou pode avaliar o produto na página dele. A avaliação só aparece na loja depois que você aprova. Aprovadas, entram na média de estrelas e ajudam o produto a aparecer melhor no Google.</p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">{TABS.map(([key, label]) => (
        <Link key={key} href={`/painel/avaliacoes?status=${key}`} className={`rounded-full px-4 py-1.5 ${key === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{label} ({data.counts[key]})</Link>))}</nav>
      <div className="mt-6 space-y-4">
        {data.items.length === 0 && <p className="card p-6 text-sm text-slate-500">Nada por aqui.</p>}
        {data.items.map(review => (
          <article key={review.id} className="card p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><span className="text-amber-500">{'★'.repeat(review.rating)}</span><span className="text-slate-300">{'★'.repeat(5 - review.rating)}</span> <b className="ml-2">{review.authorName}</b> · <Link href={`/painel/produtos/${review.product.id}`} className="underline">{review.product.name}</Link></p>
              <p className="text-xs text-slate-500">{formatDateTime(review.createdAt)}</p>
            </div>
            {review.title && <p className="mt-2 font-semibold">{review.title}</p>}
            <p className="mt-1 whitespace-pre-line text-slate-700">{review.body}</p>
            <form action={moderateReviewAction} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={review.id} />
              <label className="text-xs font-medium">Resposta da loja (aparece junto da avaliação)<textarea name="reply" rows={2} maxLength={1000} defaultValue={review.reply ?? ''} className="input mt-1" /></label>
              <div className="flex flex-wrap gap-2">
                {review.status !== 'APPROVED' && <button name="status" value="APPROVED" className="button">Aprovar</button>}
                {review.status !== 'REJECTED' && <button name="status" value="REJECTED" className="rounded-full border px-4 py-2 text-sm">Recusar</button>}
                <button className="rounded-full border px-4 py-2 text-sm">Salvar resposta</button>
              </div>
            </form>
            <form action={deleteReviewAction} className="mt-2"><input type="hidden" name="id" value={review.id} /><button className="text-xs text-red-700 underline">Excluir de vez</button></form>
          </article>))}
      </div>
      {data.total > data.page * data.pageSize && <p className="mt-4 text-sm"><Link className="underline" href={`/painel/avaliacoes?status=${status}&page=${page + 1}`}>Ver mais</Link></p>}
    </>
  );
}
