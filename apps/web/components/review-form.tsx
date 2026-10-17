'use client';
import { useActionState, useState } from 'react';
import { submitReviewAction } from '../app/review-actions';

export function ReviewForm({ productSlug }: { productSlug: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, {});
  const [rating, setRating] = useState(0);
  if (state.ok) return <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{state.ok}</p>;
  return (
    <form action={action} className="grid gap-3 text-sm">
      <input type="hidden" name="productSlug" value={productSlug} />
      <input type="hidden" name="rating" value={rating || ''} />
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <fieldset>
        <legend className="font-medium">Sua nota</legend>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} type="button" role="radio" aria-checked={rating === star} aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`} onClick={() => setRating(star)} className={`text-3xl leading-none ${star <= rating ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="font-medium">Número do pedido<input name="orderNumber" required maxLength={40} className="input" placeholder="00001" /></label>
        <label className="font-medium">E-mail da compra<input name="email" type="email" required maxLength={254} autoComplete="email" className="input" /></label>
      </div>
      <label className="font-medium">Título (opcional)<input name="title" maxLength={80} className="input" placeholder="Ex.: Caimento perfeito" /></label>
      <label className="font-medium">Seu comentário<textarea name="body" required minLength={10} maxLength={2000} rows={4} className="input" placeholder="Conte como foi: tamanho, tecido, caimento…" /></label>
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <div><button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Enviando…' : 'Enviar avaliação'}</button></div>
      <p className="text-xs text-slate-500">Só quem comprou pode avaliar. Usamos o número do pedido e o e-mail para conferir a compra. A avaliação aparece depois de aprovada.</p>
    </form>
  );
}
