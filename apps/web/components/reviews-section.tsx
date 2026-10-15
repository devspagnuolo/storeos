import type { ProductReviews } from '../lib/api';
import { ReviewForm } from './review-form';

export function Stars({ value, className = '' }: { value: number; className?: string }) {
  const full = Math.round(value);
  return <span className={`text-amber-500 ${className}`} aria-label={`Nota ${value.toFixed(1).replace('.', ',')} de 5`}>{'★'.repeat(full)}<span className="text-slate-300">{'★'.repeat(5 - full)}</span></span>;
}

export function ReviewsSection({ productSlug, reviews }: { productSlug: string; reviews: ProductReviews }) {
  const { summary, items } = reviews;
  return (
    <section id="avaliacoes" className="mt-14 border-t pt-10">
      <h2 className="text-2xl font-bold">Avaliações de quem comprou</h2>
      <div className="mt-6 grid gap-10 md:grid-cols-[260px_1fr]">
        <div>
          {summary.count > 0 ? (
            <>
              <p className="text-5xl font-black">{summary.average.toFixed(1).replace('.', ',')}</p>
              <Stars value={summary.average} className="text-2xl" />
              <p className="mt-1 text-sm text-slate-500">{summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'}</p>
              <ul className="mt-4 space-y-1 text-xs text-slate-600">{([5, 4, 3, 2, 1] as const).map(star => (
                <li key={star} className="flex items-center gap-2"><span className="w-6">{star}★</span><span className="h-2 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-amber-400" style={{ width: `${(summary.distribution[star] / summary.count) * 100}%` }} /></span><span className="w-6 text-right">{summary.distribution[star]}</span></li>))}</ul>
            </>
          ) : <p className="text-sm text-slate-500">Este produto ainda não tem avaliações. Comprou? Seja a primeira pessoa a contar como foi.</p>}
          <details className="mt-6 rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Avaliar este produto</summary><div className="mt-4"><ReviewForm productSlug={productSlug} /></div></details>
        </div>
        <ul className="space-y-6">{items.map(review => (
          <li key={review.id} className="border-b pb-6">
            <Stars value={review.rating} />
            {review.title && <p className="mt-1 font-semibold">{review.title}</p>}
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{review.body}</p>
            <p className="mt-2 text-xs text-slate-500">{review.author} · compra verificada · {new Date(review.createdAt).toLocaleDateString('pt-BR')}</p>
            {review.reply && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>Resposta da loja:</b> {review.reply}</p>}
          </li>))}</ul>
      </div>
    </section>
  );
}
