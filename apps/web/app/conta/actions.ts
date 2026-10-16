'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { accountApiUrl, accountFetch, clearCustomerSession, saveCustomerSession } from '../../lib/account/session';
import type { AccountProfile } from '../../lib/account/types';
import { resolveStoreSlug } from '../../lib/store-host';

export type LoginState = { step: 'email' | 'code'; email?: string; error?: string; info?: string };

const post = (path: string, body: unknown) => fetch(`${accountApiUrl}/account${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

/** Passo 1 envia o código; passo 2 confere e grava a sessão. "Reenviar" volta a pedir o código. */
export async function loginAction(state: LoginState, form: FormData): Promise<LoginState> {
  const intent = String(form.get('intent') ?? 'request');
  const email = String(form.get('email') ?? state.email ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { step: 'email', email, error: 'Informe um e-mail válido.' };
  const storeSlug = await resolveStoreSlug();
  try {
    if (intent === 'change') return { step: 'email', email };
    if (intent === 'request' || intent === 'resend') {
      const response = await post('/login/request', { storeSlug, email });
      if (response.status === 429) return { step: intent === 'resend' ? 'code' : 'email', email, error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' };
      if (!response.ok) return { step: 'email', email, error: 'Não foi possível enviar o código agora. Tente novamente.' };
      return { step: 'code', email, info: intent === 'resend' ? 'Enviamos um novo código.' : undefined };
    }
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) return { step: 'code', email, error: 'O código tem 6 números.' };
    const response = await post('/login/verify', { storeSlug, email, code });
    if (response.status === 429) return { step: 'code', email, error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' };
    if (!response.ok) return { step: 'code', email, error: 'Código inválido ou expirado. Confira o e-mail ou peça um novo código.' };
    const session = await response.json() as { token: string; expiresAt: string };
    await saveCustomerSession(session.token, session.expiresAt);
  } catch {
    return { step: state.step, email, error: 'Não foi possível conectar agora. Tente novamente em instantes.' };
  }
  redirect('/conta');
}

export async function logoutAction() {
  await accountFetch('/logout', { method: 'POST' }).catch(() => null);
  await clearCustomerSession();
  redirect('/conta');
}

export type ProfileState = { ok?: boolean; error?: string };

export async function updateProfileAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  try {
    const updated = await accountFetch<AccountProfile>('/me', {
      method: 'PATCH',
      body: { name: String(form.get('name') ?? '').trim(), phone: String(form.get('phone') ?? '').trim() || null, marketingOptIn: form.get('marketingOptIn') === 'on' },
    });
    if (!updated) redirect('/conta');
    revalidatePath('/conta');
    return { ok: true };
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error;
    return { error: (error as Error).message };
  }
}
