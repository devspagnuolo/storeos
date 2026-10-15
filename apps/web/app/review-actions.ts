'use server';
import { apiUrl } from '../lib/config';
import { resolveStoreSlug } from '../lib/store-host';

export type ReviewState = { error?: string; ok?: string };

/** Envia a avaliação de quem comprou (número do pedido + e-mail); a API confere a compra e deixa pendente até o lojista aprovar. */
export async function submitReviewAction(_: ReviewState, form: FormData): Promise<ReviewState> {
  if (String(form.get('website') ?? '')) return { ok: 'Obrigada! Sua avaliação foi enviada e aparece na loja depois de aprovada.' }; // campo-isca
  const text = (name: string) => String(form.get(name) ?? '').trim();
  const rating = Number(text('rating'));
  if (!rating) return { error: 'Escolha de 1 a 5 estrelas.' };
  try {
    const storeSlug = await resolveStoreSlug();
    const response = await fetch(`${apiUrl}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ storeSlug, productSlug: text('productSlug'), orderNumber: text('orderNumber'), email: text('email'), rating, title: text('title') || undefined, body: text('body') }),
    });
    if (response.status === 429) return { error: 'Muitas tentativas. Tente de novo em instantes.' };
    const body = await response.json().catch(() => undefined);
    if (!response.ok) return { error: (Array.isArray(body?.message) ? body.message.join('; ') : body?.message) || 'Não foi possível enviar agora.' };
    return { ok: body?.message ?? 'Obrigada! Sua avaliação foi enviada.' };
  } catch {
    return { error: 'Não foi possível enviar agora. Tente novamente em instantes.' };
  }
}
