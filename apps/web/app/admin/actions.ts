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
    body: JSON.stringify({ email: form.get('email'), password: form.get('password'), storeSlug: form.get('storeSlug'), code: String(form.get('code') ?? '').trim() || undefined }),
  }).catch(() => undefined);
  if (!response) return { ...kept, error: 'A API não respondeu. Tente de novo em alguns segundos.' };
  if (response.status === 429) return { ...kept, error: 'Muitas tentativas. Aguarde um minuto.' };
  if (response.status === 401) {
    const body = await response.json().catch(() => undefined);
    if (body?.code === 'MFA_REQUIRED') return { ...kept, error: 'Este usuário usa verificação em duas etapas. Digite a senha de novo e informe o código do aplicativo.' };
    if (body?.code === 'MFA_INVALID') return { ...kept, error: 'Código de verificação inválido ou já usado. Aguarde o próximo código.' };
  }
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

const fulfillmentSteps = ['pick', 'invoice', 'ship', 'deliver', 'return'] as const;
const fulfillmentDone: Record<(typeof fulfillmentSteps)[number], string> = { pick: 'Separação iniciada.', invoice: 'Nota fiscal registrada.', ship: 'Envio registrado.', deliver: 'Entrega confirmada.', return: 'Devolução registrada e estoque reposto.' };

export async function orderFulfillmentAction(_: FormState, form: FormData): Promise<FormState> {
  const number = String(form.get('number'));
  const step = fulfillmentSteps.find(item => item === form.get('step'));
  if (!step) return { error: 'Etapa inválida.' };
  const text = (name: string) => String(form.get(name) ?? '').trim() || undefined;
  const bodies = {
    pick: {},
    invoice: { invoiceNumber: text('invoiceNumber'), invoiceKey: text('invoiceKey') },
    ship: { carrier: text('carrier'), trackingCode: text('trackingCode'), trackingUrl: text('trackingUrl') },
    deliver: {},
    return: { reason: text('reason') },
  };
  try {
    await adminFetch(`/orders/${encodeURIComponent(number)}/${step}`, { method: 'POST', body: bodies[step] });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin', 'layout');
  return { ok: fulfillmentDone[step] };
}

export type MfaState = FormState & { qr?: string; secret?: string; recoveryCodes?: string[] };

export async function mfaSetupAction(): Promise<MfaState> {
  try {
    const { secret, otpauthUrl } = await adminFetch<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST', body: {} });
    const { toDataURL } = await import('qrcode');
    return { secret, qr: await toDataURL(otpauthUrl, { margin: 1, width: 192 }) };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function mfaEnableAction(_: MfaState, form: FormData): Promise<MfaState> {
  try {
    const { recoveryCodes } = await adminFetch<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', body: { code: String(form.get('code') ?? '') } });
    revalidatePath('/admin/seguranca');
    return { ok: 'Verificação em duas etapas ativada.', recoveryCodes };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function mfaDisableAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch('/auth/mfa/disable', { method: 'POST', body: { password: String(form.get('password') ?? ''), code: String(form.get('code') ?? '') } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/seguranca');
  return { ok: 'Verificação em duas etapas desativada.' };
}

export async function revokeSessionAction(form: FormData) {
  const id = String(form.get('id') ?? '');
  await adminFetch(id === 'all' ? '/auth/sessions' : `/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (id === 'all') redirect('/admin/login');
  revalidatePath('/admin/seguranca');
}

export async function createCouponAction(_: FormState, form: FormData): Promise<FormState> {
  const num = (name: string) => { const raw = String(form.get(name) ?? '').trim().replace(',', '.'); return raw ? Number(raw) : undefined; };
  const date = (name: string) => { const raw = String(form.get(name) ?? ''); return raw ? new Date(raw).toISOString() : undefined; };
  const type = String(form.get('type'));
  try {
    await adminFetch('/coupons', { method: 'POST', body: {
      code: String(form.get('code') ?? '').trim(), type, value: type === 'FREE_SHIPPING' ? undefined : num('value'),
      minSubtotal: num('minSubtotal'), maxUses: num('maxUses'), oncePerCustomer: form.get('oncePerCustomer') === 'on',
      startsAt: date('startsAt'), endsAt: date('endsAt'),
    } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/cupons');
  return { ok: 'Cupom criado.' };
}

export async function toggleCouponAction(form: FormData) {
  await adminFetch(`/coupons/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/cupons');
}

async function simplePost(path: string, method: 'POST' | 'PATCH', body: unknown, done: string): Promise<FormState> {
  try {
    await adminFetch(path, { method, body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/colecoes');
  return { ok: done };
}

export async function createBrandAction(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim();
  return simplePost('/catalog/brands', 'POST', { name, slug: slugifyServer(name) }, 'Marca criada.');
}

const skuList = (value: FormDataEntryValue | null) => String(value ?? '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean);
const slugifyServer = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function saveCollectionAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const name = String(form.get('name') ?? '').trim();
  const body = { name, description: String(form.get('description') ?? '').trim() || undefined, active: form.get('active') === 'on', skus: skuList(form.get('skus')), ...(id ? {} : { slug: slugifyServer(name) }) };
  return simplePost(id ? `/catalog/collections/${encodeURIComponent(id)}` : '/catalog/collections', id ? 'PATCH' : 'POST', body, id ? 'Coleção salva.' : 'Coleção criada.');
}

export async function saveCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('id')));
  try {
    await adminFetch(`/customers/${id}`, { method: 'PATCH', body: {
      phone: String(form.get('phone') ?? '').trim(), notes: String(form.get('notes') ?? '').trim(),
      tags: String(form.get('tags') ?? '').split(',').map(t => t.trim()).filter(Boolean), marketingOptIn: form.get('marketingOptIn') === 'on',
    } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/clientes');
  return { ok: 'Dados salvos.' };
}

export async function anonymizeCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch(`/customers/${encodeURIComponent(String(form.get('id')))}/anonymize`, { method: 'POST', body: {} });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/clientes');
  redirect('/admin/clientes');
}

export type LoyaltyState = FormState & { code?: string };

export async function loyaltyAction(_: LoyaltyState, form: FormData): Promise<LoyaltyState> {
  const id = encodeURIComponent(String(form.get('id')));
  const kind = form.get('kind') === 'redeem' ? 'redeem' : 'adjust';
  const points = Number(String(form.get('points') ?? '').trim());
  if (!Number.isInteger(points) || points === 0) return { error: 'Informe uma quantidade inteira de pontos.' };
  try {
    const result = await adminFetch<{ code?: string; value?: string }>(`/loyalty/customers/${id}/${kind}`, { method: 'POST', body: kind === 'redeem' ? { points } : { points, note: String(form.get('note') ?? '').trim() } });
    revalidatePath('/admin/clientes');
    return kind === 'redeem' ? { ok: `Cupom de R$ ${result.value} gerado.`, code: result.code } : { ok: 'Pontos ajustados.' };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function savePageAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const title = String(form.get('title') ?? '').trim();
  const body = {
    title, body: String(form.get('body') ?? '').trim(), published: form.get('published') === 'on', showInFooter: form.get('showInFooter') === 'on',
    seoDescription: String(form.get('seoDescription') ?? '').trim() || undefined,
    ...(id ? {} : { slug: String(form.get('slug') ?? '').trim() || slugifyServer(title) }),
  };
  try {
    await adminFetch(id ? `/content/admin/pages/${encodeURIComponent(id)}` : '/content/admin/pages', { method: id ? 'PATCH' : 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/paginas');
  return { ok: id ? 'Página salva.' : 'Página criada.' };
}

export async function deletePageAction(form: FormData) {
  await adminFetch(`/content/admin/pages/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/paginas');
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
    // Na edição, vazio remove a marca; na criação, simplesmente não envia.
    brandId: text('brandId') || (id ? null : undefined),
    seoTitle: text('seoTitle') || undefined,
    seoDescription: text('seoDescription') || undefined,
    // Peso e medidas alimentam a cotação nas transportadoras; vazio remove na edição.
    weightGrams: text('weightGrams') ? Number(text('weightGrams')) : id ? null : undefined,
    widthCm: text('widthCm') ? Number(text('widthCm')) : id ? null : undefined,
    heightCm: text('heightCm') ? Number(text('heightCm')) : id ? null : undefined,
    lengthCm: text('lengthCm') ? Number(text('lengthCm')) : id ? null : undefined,
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
    freeOnly: form.get('freeOnly') === 'on',
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
  const version = Number(form.get('version'));
  const publish = form.get('intent') === 'publish';
  if (!Number.isInteger(version) || version < 0) return { error: 'Recarregue a página para obter a versão atual.' };
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
    await adminFetch(publish ? '/store/storefront/publish' : '/store/storefront/draft', {
      method: publish ? 'POST' : 'PATCH', body: { version, config: themeConfig },
    });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  if (publish) revalidatePath('/', 'layout');
  revalidatePath('/admin/site');
  revalidatePath('/painel/site');
  redirect('/painel/site?salvo=' + (publish ? 'publicado' : 'rascunho'));
}

export async function restoreStorefrontAction(_: FormState, form: FormData): Promise<FormState> {
  const version = Number(form.get('version'));
  const publicationId = String(form.get('publicationId') ?? '');
  if (!Number.isInteger(version) || version < 0 || !publicationId) return { error: 'Recarregue o histórico e tente novamente.' };
  try {
    await adminFetch('/store/storefront/restore', { method: 'POST', body: { version, publicationId } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/site');
  revalidatePath('/painel/site');
  redirect('/painel/site?salvo=restaurado');
}

export async function saveCategoryAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const name = String(form.get('name') ?? '').trim();
  const parentId = String(form.get('parentId') ?? '') || null;
  try {
    await adminFetch(id ? `/catalog/categories/${encodeURIComponent(id)}` : '/catalog/categories', { method: id ? 'PATCH' : 'POST', body: { name, parentId, ...(id ? {} : { slug: slugifyServer(name) }) } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/categorias');
  return { ok: id ? 'Categoria salva.' : 'Categoria criada.' };
}

export async function deleteCategoryAction(form: FormData) {
  await adminFetch(`/catalog/categories/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/categorias');
}

export async function createPromotionAction(_: FormState, form: FormData): Promise<FormState> {
  const num = (name: string) => { const raw = String(form.get(name) ?? '').trim().replace(',', '.'); return raw ? Number(raw) : undefined; };
  const date = (name: string) => { const raw = String(form.get(name) ?? ''); return raw ? new Date(raw).toISOString() : undefined; };
  const type = String(form.get('type'));
  try {
    await adminFetch('/promotions', { method: 'POST', body: {
      name: String(form.get('name') ?? '').trim(), type,
      value: type === 'BUY_X_PAY_Y' ? undefined : num('value'), buyQty: type === 'BUY_X_PAY_Y' ? num('buyQty') : undefined, payQty: type === 'BUY_X_PAY_Y' ? num('payQty') : undefined,
      minSubtotal: type === 'CART_PERCENT' ? num('minSubtotal') : undefined, skus: type === 'CART_PERCENT' ? undefined : skuList(form.get('skus')),
      startsAt: date('startsAt'), endsAt: date('endsAt'),
    } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/promocoes');
  return { ok: 'Promoção criada e já ativa na loja.' };
}

export async function togglePromotionAction(form: FormData) {
  await adminFetch(`/promotions/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/promocoes');
}

export async function deletePromotionAction(form: FormData) {
  await adminFetch(`/promotions/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/promocoes');
}

export async function saveVariantsAction(_: FormState, form: FormData): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('productId')));
  let variants: unknown;
  try {
    variants = JSON.parse(String(form.get('variants') ?? '[]'));
  } catch {
    return { error: 'Não foi possível ler as variações. Recarregue a página.' };
  }
  try {
    await adminFetch(`/catalog/products/${id}/variants`, { method: 'PUT', body: { variants } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/admin/produtos/${id}`);
  return { ok: 'Variações salvas.' };
}

export async function adjustStockAction(_: FormState, form: FormData): Promise<FormState> {
  const productId = String(form.get('item') ?? '').split(':')[0];
  const variantId = String(form.get('item') ?? '').split(':')[1] || undefined;
  const quantity = Number(String(form.get('quantity') ?? '').trim());
  if (!productId || !Number.isInteger(quantity)) return { error: 'Informe o item e uma quantidade inteira.' };
  try {
    await adminFetch('/inventory/adjust', { method: 'POST', body: { productId, variantId, mode: String(form.get('mode')) === 'SET' ? 'SET' : 'DELTA', quantity, reason: String(form.get('reason') ?? '').trim() } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/estoque');
  return { ok: 'Estoque atualizado.' };
}
