'use server';
import { apiUrl } from '../../lib/config';

export type SignupState = { error?: string; done?: { email: string; storeSlug: string }; values?: { ownerName: string; email: string; storeName: string } };

/** Cria a conta e a loja. Os valores voltam para a tela para a pessoa não digitar tudo de novo se algo falhar. */
export async function signupAction(_: SignupState, form: FormData): Promise<SignupState> {
  const values = { ownerName: String(form.get('ownerName') ?? ''), email: String(form.get('email') ?? ''), storeName: String(form.get('storeName') ?? '') };
  if (String(form.get('password')) !== String(form.get('confirm'))) return { values, error: 'As duas senhas não são iguais.' };
  const response = await fetch(`${apiUrl}/onboarding/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ ...values, password: String(form.get('password') ?? ''), acceptTerms: form.get('acceptTerms') === 'on' }),
  }).catch(() => undefined);
  if (!response) return { values, error: 'Não conseguimos falar com o servidor. Tente de novo em alguns segundos.' };
  if (response.status === 429) return { values, error: 'Muitas tentativas. Tente novamente mais tarde.' };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { values, error: typeof body.message === 'string' ? body.message : 'Não foi possível criar a loja. Confira os dados.' };
  return { done: { email: body.email, storeSlug: body.storeSlug } };
}

export type ResendState = { ok?: boolean; error?: string };

export async function resendAction(_: ResendState, form: FormData): Promise<ResendState> {
  const response = await fetch(`${apiUrl}/onboarding/resend`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ storeSlug: String(form.get('storeSlug') ?? '').trim().toLowerCase(), email: String(form.get('email') ?? '').trim() }),
  }).catch(() => undefined);
  if (!response?.ok) return { error: 'Não foi possível reenviar agora. Confira os dados e tente de novo.' };
  return { ok: true };
}
