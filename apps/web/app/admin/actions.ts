'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, adminFetch, ApiError, clearSession, REFRESH_COOKIE, saveSession, serverApiUrl, Session } from '../../lib/admin/session';

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

const decimal = (value: string) => Number(value.replace(',', '.'));

export async function saveShippingRuleAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const body = {
    name: text('name'),
    states: form.getAll('states').map(String),
    price: decimal(text('price')),
    freeAbove: text('freeAbove') ? decimal(text('freeAbove')) : null,
    minDays: Number(text('minDays')),
    maxDays: Number(text('maxDays')),
    position: Number(text('position') || 0),
    active: form.get('active') === 'on',
  };
  if (!Number.isFinite(body.price) || body.price < 0) return { error: 'Preço inválido.' };
  if (body.freeAbove !== null && (!Number.isFinite(body.freeAbove) || body.freeAbove < 0)) return { error: 'Valor de frete grátis inválido.' };
  try {
    await adminFetch(id ? `/shipping/rules/${id}` : '/shipping/rules', { method: id ? 'PATCH' : 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.status === 403 ? 'Seu usuário não tem permissão para configurar o frete. Saia e entre de novo se acabou de receber o acesso.' : error.message };
    throw error;
  }
  revalidatePath('/admin/frete');
  return { ok: id ? 'Regra salva.' : 'Regra criada.' };
}

export async function deleteShippingRuleAction(form: FormData) {
  await adminFetch(`/shipping/rules/${String(form.get('id'))}`, { method: 'DELETE' });
  revalidatePath('/admin/frete');
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const newPassword = String(form.get('newPassword') ?? '');
  if (newPassword !== String(form.get('confirmPassword') ?? '')) return { error: 'A confirmação não confere com a nova senha.' };
  try {
    // A API encerra todas as sessões abertas e devolve uma nova só para este navegador.
    await saveSession(await adminFetch<Session>('/auth/password', { method: 'POST', body: { currentPassword: String(form.get('currentPassword') ?? ''), newPassword } }));
  } catch (error) {
    if (error instanceof ApiError) return { error: error.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : error.message };
    throw error;
  }
  return { ok: 'Senha alterada. Outros dispositivos conectados precisarão entrar de novo.' };
}

export async function saveStoreAction(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim();
  const logo = form.get('logo');
  const removeLogo = form.get('removeLogo') === 'on';
  let logoUrl: string | null | undefined = removeLogo ? null : undefined;
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 1_000_000) return { error: 'A imagem precisa ter até 1 MB.' };
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) return { error: 'Sua sessão expirou. Entre novamente para continuar.' };
    const uploadForm = new FormData();
    uploadForm.set('file', logo, logo.name);
    const response = await fetch(`${serverApiUrl}/store/logo`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: uploadForm }).catch(() => undefined);
    if (!response) return { error: 'Não foi possível conectar ao serviço de imagens.' };
    const result = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = Array.isArray(result?.message) ? result.message.join('; ') : result?.message;
      return { error: message || 'Não foi possível enviar a imagem.' };
    }
    logoUrl = result.logoUrl;
  }
  try {
    await adminFetch('/store', { method: 'PATCH', body: { name, ...(logoUrl === undefined ? {} : { logoUrl }) } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: 'Identidade visual salva. A logo também foi definida como favicon.' };
}

export async function saveStorefrontAction(_: FormState, form: FormData): Promise<FormState> {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const heroFile = form.get('heroImage');
  let heroImageUrl: string | null = text('heroImageUrl') || null;

  if (heroFile instanceof File && heroFile.size > 0) {
    if (heroFile.size > 5_000_000) return { error: 'A imagem principal precisa ter até 5 MB.' };
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) return { error: 'Sua sessão expirou. Entre novamente para continuar.' };
    const uploadForm = new FormData();
    uploadForm.set('file', heroFile, heroFile.name);
    const response = await fetch(`${serverApiUrl}/store/hero`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: uploadForm,
    }).catch(() => undefined);
    if (!response) return { error: 'Não foi possível conectar ao serviço de imagens.' };
    const result = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = Array.isArray(result?.message) ? result.message.join('; ') : result?.message;
      return { error: message || 'Não foi possível enviar a imagem principal.' };
    }
    heroImageUrl = result.heroImageUrl;
  }

  const themeConfig = {
    announcementText: text('announcementText'),
    heroTitle: text('heroTitle'),
    heroDescription: text('heroDescription'),
    heroCta: text('heroCta'),
    heroImageUrl,
    accentColor: text('accentColor'),
  };
  if (themeConfig.heroTitle.length < 2 || themeConfig.heroTitle.length > 120) return { error: 'O título precisa ter entre 2 e 120 caracteres.' };
  if (themeConfig.heroDescription.length > 300 || themeConfig.announcementText.length > 100) return { error: 'Revise o limite de caracteres dos textos.' };
  if (!/^#[0-9a-fA-F]{6}$/.test(themeConfig.accentColor)) return { error: 'Escolha uma cor válida para a loja.' };

  try {
    await adminFetch('/store', { method: 'PATCH', body: { themeConfig } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  revalidatePath('/admin/site');
  return { ok: 'Vitrine atualizada e publicada.' };
}
