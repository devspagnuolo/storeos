'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminFetch, ApiError, clearSession, REFRESH_COOKIE, saveSession, serverApiUrl, Session } from '../../lib/admin/session';

export type FormState = { error?: string; ok?: string };
export type LoginState = { error?: string; email?: string; storeSlug?: string };

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  // O React limpa o formulário após a ação; devolvemos e-mail e loja para não obrigar a redigitar.
  const kept = { email: String(form.get('email') ?? ''), storeSlug: String(form.get('storeSlug') ?? '') };
  const response = await fetch(`${serverApiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: form.get('email'), password: form.get('password'), storeSlug: form.get('storeSlug') }),
  }).catch(() => undefined);
  if (!response) return { ...kept, error: 'A API não respondeu. Tente de novo em alguns segundos.' };
  if (response.status === 429) return { ...kept, error: 'Muitas tentativas. Aguarde um minuto.' };
  if (!response.ok) return { ...kept, error: 'E-mail, senha ou loja incorretos.' };
  await saveSession((await response.json()) as Session);
  redirect('/admin');
}

export async function logoutAction() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refreshToken) await fetch(`${serverApiUrl}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  await clearSession();
  redirect('/admin/login');
}

export async function orderTransitionAction(_: FormState, form: FormData): Promise<FormState> {
  const number = String(form.get('number'));
  const action = form.get('action') === 'cancel' ? 'cancel' : 'confirm-payment';
  try {
    await adminFetch(`/orders/${encodeURIComponent(number)}/${action}`, { method: 'POST', body: { message: String(form.get('message') || '') || undefined } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin', 'layout');
  return { ok: action === 'cancel' ? 'Pedido cancelado e estoque devolvido.' : 'Pagamento confirmado e estoque baixado.' };
}

export async function saveProductAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const body = {
    name: text('name'),
    slug: text('slug'),
    sku: text('sku'),
    price: Number(text('price').replace(',', '.')),
    description: text('description') || undefined,
    status: text('status'),
    stock: Number(text('stock') || 0),
    imageUrl: id ? text('imageUrl') : text('imageUrl') || undefined,
    categoryIds: form.getAll('categoryIds').map(String),
  };
  if (!Number.isFinite(body.price) || body.price < 0) return { error: 'Preço inválido.' };
  if (!Number.isInteger(body.stock) || body.stock < 0) return { error: 'Estoque deve ser um número inteiro.' };
  let saved: { id: string };
  try {
    saved = await adminFetch<{ id: string }>(id ? `/catalog/products/${id}` : '/catalog/products', { method: id ? 'PATCH' : 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/produtos');
  if (!id) redirect(`/admin/produtos/${saved.id}?criado=1`);
  return { ok: 'Produto salvo.' };
}
