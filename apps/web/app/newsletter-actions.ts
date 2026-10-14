'use server';
import { apiUrl } from '../lib/config';
import { resolveStoreSlug } from '../lib/store-host';

export type NewsletterState = { error?: string; ok?: string };

/** Inscrição pública na newsletter; a API ignora repetidos e aplica limite por IP. */
export async function subscribeNewsletterAction(_: NewsletterState, form: FormData): Promise<NewsletterState> {
  const email = String(form.get('email') ?? '').trim();
  if (!email) return { error: 'Informe seu e-mail.' };
  if (String(form.get('website') ?? '')) return { ok: 'Pronto! Você vai receber nossas novidades.' }; // campo-isca: robôs preenchem, pessoas não veem
  try {
    const storeSlug = await resolveStoreSlug();
    const response = await fetch(`${apiUrl}/engagement/newsletter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeSlug, email }), cache: 'no-store' });
    if (response.status === 429) return { error: 'Muitas tentativas. Tente de novo em instantes.' };
    if (!response.ok) return { error: 'Confira o e-mail digitado.' };
  } catch {
    return { error: 'Não foi possível agora. Tente novamente em instantes.' };
  }
  return { ok: 'Pronto! Você vai receber nossas novidades.' };
}
