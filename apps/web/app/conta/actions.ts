'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { accountApiUrl, accountFetch, clearCustomerSession, saveCustomerSession } from '../../lib/account/session';
import type { AccountProfile, FidelizeiLoyalty, ReservedReward } from '../../lib/account/types';
import { resolveStoreSlug } from '../../lib/store-host';

export type LoginState = { step: 'email' | 'code'; email?: string; name?: string; error?: string; info?: string };

const post = (path: string, body: unknown) => fetch(`${accountApiUrl}/account${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

/** Passo 1 envia o código; passo 2 confere e grava a sessão. "Reenviar" volta a pedir o código. */
export async function loginAction(state: LoginState, form: FormData): Promise<LoginState> {
  const intent = String(form.get('intent') ?? 'request');
  const email = String(form.get('email') ?? state.email ?? '').trim().toLowerCase();
  // Criar conta manda o nome junto; entrar não.
  const name = String(form.get('name') ?? state.name ?? '').trim().slice(0, 120) || undefined;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { step: 'email', email, name, error: 'Informe um e-mail válido.' };
  if (name !== undefined && name.length < 2) return { step: 'email', email, name, error: 'Informe seu nome.' };
  const storeSlug = await resolveStoreSlug();
  try {
    if (intent === 'change') return { step: 'email', email, name };
    if (intent === 'request' || intent === 'resend') {
      const response = await post('/login/request', { storeSlug, email, ...(name && { name }) });
      if (response.status === 429) return { step: intent === 'resend' ? 'code' : 'email', email, name, error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' };
      if (!response.ok) return { step: 'email', email, name, error: 'Não foi possível enviar o código agora. Tente novamente.' };
      return { step: 'code', email, name, info: intent === 'resend' ? 'Enviamos um novo código.' : undefined };
    }
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) return { step: 'code', email, name, error: 'O código tem 6 números.' };
    const response = await post('/login/verify', { storeSlug, email, code, ...(name && { name }) });
    if (response.status === 429) return { step: 'code', email, name, error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' };
    if (!response.ok) return { step: 'code', email, name, error: 'Código inválido ou expirado. Confira o e-mail ou peça um novo código.' };
    const session = await response.json() as { token: string; expiresAt: string };
    await saveCustomerSession(session.token, session.expiresAt);
  } catch {
    return { step: state.step, email, name, error: 'Não foi possível conectar agora. Tente novamente em instantes.' };
  }
  redirect(form.get('voltar') === 'checkout' ? '/checkout' : '/conta');
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

export type EnrollState = { error?: string; ok?: boolean };

/** Adesão ao Fidelizei: só com o aceite marcado; o CPF vem do cadastro quando já existe. */
export async function enrollFidelizeiAction(_: EnrollState, form: FormData): Promise<EnrollState> {
  if (form.get('consent') !== 'on') return { error: 'Marque que aceita os termos do programa e a política de privacidade.' };
  try {
    const result = await accountFetch<FidelizeiLoyalty>('/fidelizei/enroll', { method: 'POST', body: { consent: true, ...(form.get('cpf') && { cpf: String(form.get('cpf')) }) } });
    if (!result) return { error: 'Entre na sua conta de novo para continuar.' };
    revalidatePath('/conta');
    return { ok: true };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** Saldo e benefícios para o checkout; sem sessão ou sem programa, null. */
export async function fidelizeiLoyaltyAction(): Promise<FidelizeiLoyalty | null> {
  return accountFetch<FidelizeiLoyalty>('/fidelizei').catch(() => null);
}

export async function reserveRewardAction(rewardId: string, subtotal: number): Promise<{ reward?: ReservedReward; error?: string }> {
  try {
    const reward = await accountFetch<ReservedReward>('/fidelizei/reserve', { method: 'POST', body: { rewardId, subtotal } });
    return reward ? { reward } : { error: 'Entre na sua conta de novo para usar seus pontos.' };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function releaseRewardAction(checkoutId: string): Promise<void> {
  await accountFetch('/fidelizei/release', { method: 'POST', body: { checkoutId } }).catch(() => null);
}
