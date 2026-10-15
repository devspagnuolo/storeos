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
    if (body?.code === 'EMAIL_NOT_VERIFIED') return { ...kept, error: 'Falta confirmar o seu e-mail. Abra a mensagem que enviamos quando você criou a loja e clique em “Confirmar meu e-mail”.' };
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
      firstOrderOnly: form.get('firstOrderOnly') === 'on', categoryIds: form.getAll('categoryIds').map(String),
      startsAt: date('startsAt'), endsAt: date('endsAt'),
    } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/cupons');
  return { ok: 'Cupom criado.' };
}

export async function createBulkCouponsAction(_: FormState, form: FormData): Promise<FormState> {
  const num = (name: string) => { const raw = String(form.get(name) ?? '').trim().replace(',', '.'); return raw ? Number(raw) : undefined; };
  const date = (name: string) => { const raw = String(form.get(name) ?? ''); return raw ? new Date(raw).toISOString() : undefined; };
  const type = String(form.get('type'));
  const campaign = String(form.get('campaign') ?? '').trim();
  try {
    const result = await adminFetch<{ created: number }>('/coupons/bulk', { method: 'POST', body: {
      prefix: String(form.get('prefix') ?? '').trim(), count: num('count'), campaign, type, value: type === 'FREE_SHIPPING' ? undefined : num('value'),
      minSubtotal: num('minSubtotal'), oncePerCustomer: form.get('oncePerCustomer') === 'on',
      firstOrderOnly: form.get('firstOrderOnly') === 'on', categoryIds: form.getAll('categoryIds').map(String),
      startsAt: date('startsAt'), endsAt: date('endsAt'),
    } });
    revalidatePath('/admin/cupons');
    return { ok: `${result.created} códigos criados na campanha "${campaign}". Veja a lista abaixo.` };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function toggleCampaignAction(form: FormData) {
  const name = String(form.get('name'));
  await adminFetch(`/coupons/campaigns/${encodeURIComponent(name)}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/cupons');
  revalidatePath('/admin/cupons/campanha');
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

export async function addCustomerNoteAction(_: FormState, form: FormData): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('id')));
  try { await adminFetch(`/customers/${id}/notes`, { method: 'POST', body: { body: String(form.get('body') ?? '').trim() } }); }
  catch (error) { if (error instanceof ApiError) return { error: error.message }; throw error; }
  revalidatePath(`/admin/clientes/${id}`);
  return { ok: 'Anotação salva.' };
}

export async function deleteCustomerNoteAction(_: FormState, form: FormData): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('id')));
  try { await adminFetch(`/customers/${id}/notes/${encodeURIComponent(String(form.get('noteId')))}`, { method: 'DELETE' }); }
  catch (error) { if (error instanceof ApiError) return { error: error.message }; throw error; }
  revalidatePath(`/admin/clientes/${id}`);
  return {};
}

export async function saveCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('id')));
  try {
    await adminFetch(`/customers/${id}`, { method: 'PATCH', body: {
      phone: String(form.get('phone') ?? '').trim(),
      tags: String(form.get('tags') ?? '').split(',').map(t => t.trim()).filter(Boolean), marketingOptIn: form.get('marketingOptIn') === 'on',
    } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${id}`);
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
    // A galeria inteira vem na ordem mostrada; na edição, lista vazia remove as fotos.
    imageUrls: id ? form.getAll('imageUrls').map(String) : form.getAll('imageUrls').length ? form.getAll('imageUrls').map(String) : undefined,
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
    // Dados fiscais para a nota; vazio remove na edição.
    ncm: text('ncm') || (id ? null : undefined),
    cest: text('cest') || (id ? null : undefined),
    gtin: text('gtin').replace(/\s/g, '') || (id ? null : undefined),
    taxOrigin: text('taxOrigin') !== '' ? Number(text('taxOrigin')) : id ? null : undefined,
    unit: text('unit') || (id ? null : undefined),
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

export type StorefrontSaveResult = { version?: number; error?: string; conflict?: boolean };

/** Salva o rascunho (sem alterar a loja publicada) ou publica. Devolve a nova versão para o editor seguir salvando sem recarregar. */
export async function saveStorefrontConfigAction(version: number, config: unknown, publish: boolean): Promise<StorefrontSaveResult> {
  if (!Number.isInteger(version) || version < 0) return { error: 'Recarregue a página para obter a versão atual.', conflict: true };
  try {
    const result = await adminFetch<{ version: number }>(publish ? '/store/storefront/publish' : '/store/storefront/draft', {
      method: publish ? 'POST' : 'PATCH', body: { version, config },
    });
    if (publish) revalidatePath('/', 'layout');
    return { version: result.version };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message, conflict: error.status === 409 };
    throw error;
  }
}

export async function getPublicationConfigAction(id: string): Promise<{ config?: unknown; error?: string }> {
  try {
    const result = await adminFetch<{ config: unknown }>(`/store/storefront/publications/${encodeURIComponent(id)}`);
    return { config: result.config };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
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
  // O banner fixo da categoria: vazio remove na edição e simplesmente não é enviado na criação.
  const banner = (key: string) => String(form.get(key) ?? '').trim() || (id ? null : undefined);
  try {
    await adminFetch(id ? `/catalog/categories/${encodeURIComponent(id)}` : '/catalog/categories', { method: id ? 'PATCH' : 'POST', body: { name, parentId, ...(form.has('bannerSection') ? { bannerUrl: banner('bannerUrl'), bannerMobileUrl: banner('bannerMobileUrl') } : {}), ...(id && form.get('position') !== null ? { position: Number(form.get('position')) || 0 } : {}), ...(id ? {} : { slug: slugifyServer(name) }) } });
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

async function stockCall(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, ok: string): Promise<FormState> {
  try { await adminFetch(path, { method, body }); }
  catch (error) { if (error instanceof ApiError) return { error: error.message }; throw error; }
  revalidatePath('/admin/estoque');
  revalidatePath('/admin/estoque/depositos');
  return { ok };
}

export async function createWarehouseAction(_: FormState, form: FormData): Promise<FormState> {
  return stockCall('/inventory/warehouses', 'POST', { name: String(form.get('name') ?? '').trim() }, 'Depósito criado.');
}

export async function toggleWarehouseAction(form: FormData) {
  await adminFetch(`/inventory/warehouses/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/estoque/depositos');
}

export async function deleteWarehouseAction(_: FormState, form: FormData): Promise<FormState> {
  return stockCall(`/inventory/warehouses/${encodeURIComponent(String(form.get('id')))}`, 'DELETE', undefined, 'Depósito excluído.');
}

export async function transferStockAction(_: FormState, form: FormData): Promise<FormState> {
  const [productId, variantId] = String(form.get('item') ?? '').split(':');
  const quantity = Number(String(form.get('quantity') ?? '').trim());
  if (!productId || !Number.isInteger(quantity) || quantity < 1) return { error: 'Informe o item e uma quantidade inteira maior que zero.' };
  return stockCall('/inventory/transfer', 'POST', { productId, variantId: variantId || undefined, fromId: String(form.get('fromId')), toId: String(form.get('toId')), quantity, reason: String(form.get('reason') ?? '').trim() || undefined }, 'Transferência feita.');
}

export async function adjustWarehouseAction(_: FormState, form: FormData): Promise<FormState> {
  const [productId, variantId] = String(form.get('item') ?? '').split(':');
  const quantity = Number(String(form.get('quantity') ?? '').trim());
  if (!productId || !Number.isInteger(quantity)) return { error: 'Informe o item e uma quantidade inteira.' };
  return stockCall('/inventory/adjust-warehouse', 'POST', { productId, variantId: variantId || undefined, warehouseId: String(form.get('warehouseId')), mode: String(form.get('mode')) === 'SET' ? 'SET' : 'DELTA', quantity, reason: String(form.get('reason') ?? '').trim() }, 'Estoque do depósito atualizado.');
}

export async function saveMenuAction(_: FormState, form: FormData): Promise<FormState> {
  const key = String(form.get('key')) === 'footer' ? 'footer' : 'main';
  let items: unknown;
  try { items = JSON.parse(String(form.get('items') ?? '[]')); } catch { return { error: 'Menu inválido.' }; }
  try {
    await adminFetch(`/content/admin/menus/${key}`, { method: 'PUT', body: { items } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: 'Menu salvo. Já está na loja.' };
}

export async function resetMenuAction(form: FormData) {
  const key = String(form.get('key')) === 'footer' ? 'footer' : 'main';
  await adminFetch(`/content/admin/menus/${key}`, { method: 'DELETE' });
  revalidatePath('/', 'layout');
}

export type ImportState = { error?: string; report?: import('../../lib/admin/types').ImportReport };

/** Envia a planilha de produtos (CSV) para a API; "check" só confere, "import" grava. */
export async function importProductsAction(_: ImportState, form: FormData): Promise<ImportState> {
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return { error: 'Escolha o arquivo CSV da planilha.' };
  if (file.size > 3_500_000) return { error: 'O arquivo passa de 3,5 MB. Divida a planilha em partes menores.' };
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/admin/login');
  const dryRun = String(form.get('mode')) !== 'import';
  const response = await fetch(`${serverApiUrl}/catalog/products/import?dryRun=${dryRun}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/csv' }, body: await file.text(), cache: 'no-store' });
  if (response.status === 401) redirect('/admin/login');
  const body = await response.json().catch(() => undefined);
  if (!response.ok) return { error: (Array.isArray(body?.message) ? body.message.join('; ') : body?.message) || 'Não foi possível ler a planilha.' };
  if (!dryRun) { revalidatePath('/admin/produtos'); revalidatePath('/', 'layout'); }
  return { report: body };
}

export async function saveBannerAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get('id') ? String(form.get('id')) : undefined;
  const text = (name: string) => String(form.get(name) ?? '').trim();
  const date = (name: string) => (text(name) ? new Date(text(name)).toISOString() : null);
  if (!text('imageUrl')) return { error: 'Envie a imagem do banner.' };
  const body = {
    imageUrl: text('imageUrl'), mobileImageUrl: text('mobileImageUrl') || null, title: text('title') || null, subtitle: text('subtitle') || null,
    ctaLabel: text('ctaLabel') || null, linkUrl: text('linkUrl') || null, startsAt: date('startsAt'), endsAt: date('endsAt'),
    ...(id ? { position: Number(text('position')) || 0 } : {}),
  };
  try {
    await adminFetch(id ? `/engagement/admin/banners/${encodeURIComponent(id)}` : '/engagement/admin/banners', { method: id ? 'PATCH' : 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/banners');
  revalidatePath('/', 'layout');
  return { ok: id ? 'Banner salvo.' : 'Banner criado.' };
}

/** Várias imagens de uma vez: cada uma vira um slide do carrossel, na ordem enviada. */
export async function bulkBannersAction(_: FormState, form: FormData): Promise<FormState> {
  const images = form.getAll('bulkImages').map(String).filter(Boolean);
  if (!images.length) return { error: 'Escolha ao menos uma imagem.' };
  try {
    await adminFetch('/engagement/admin/banners/bulk', { method: 'POST', body: { images } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/banners');
  revalidatePath('/', 'layout');
  return { ok: `${images.length} banner(s) adicionados ao carrossel. Edite cada um para colocar título e link.` };
}

export async function toggleBannerAction(form: FormData) {
  await adminFetch(`/engagement/admin/banners/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/banners');
  revalidatePath('/', 'layout');
}

export async function deleteBannerAction(form: FormData) {
  await adminFetch(`/engagement/admin/banners/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/banners');
  revalidatePath('/', 'layout');
}

export async function saveWhatsappAction(_: FormState, form: FormData): Promise<FormState> {
  const number = String(form.get('number') ?? '').trim();
  try {
    await adminFetch('/engagement/admin/whatsapp', { method: 'PUT', body: { number: number || null, message: String(form.get('message') ?? '').trim() || null } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: number ? 'WhatsApp salvo. O botão já aparece na loja.' : 'Botão de WhatsApp removido da loja.' };
}

export async function unsubscribeAction(form: FormData) {
  await adminFetch(`/engagement/admin/newsletter/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/newsletter');
}

/** Leva o lojista à tela de autorização do Bling; ele volta pelo endereço de retorno da API. */
export async function connectBlingAction(): Promise<void> {
  let url: string | undefined;
  try {
    ({ url } = await adminFetch<{ url: string }>('/bling/connect'));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  redirect(url ?? '/admin/bling?erro=1');
}

export async function disconnectBlingAction() {
  await adminFetch('/bling/connection', { method: 'DELETE' });
  revalidatePath('/admin/bling');
}

export async function importBlingAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch('/bling/import', { method: 'POST', body: { mode: form.get('mode') === 'update' ? 'update' : 'new' } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/bling');
  return { ok: 'Importação iniciada. Acompanhe o andamento abaixo.' };
}

export async function importBlingSelectedAction(ids: number[], mode: 'new' | 'update'): Promise<FormState> {
  if (!ids.length) return { error: 'Marque pelo menos um produto.' };
  try {
    await adminFetch('/bling/import', { method: 'POST', body: { ids, mode } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/bling');
  return { ok: `Importando ${ids.length} produto(s). Acompanhe o andamento abaixo.` };
}

export async function resendBlingOrderAction(form: FormData) {
  await adminFetch(`/bling/orders/${encodeURIComponent(String(form.get('number')))}/send`, { method: 'POST', body: {} });
  revalidatePath('/admin/bling');
}

export async function requestBlingInvoiceAction(form: FormData) {
  const number = String(form.get('number') ?? '');
  try {
    await adminFetch(`/bling/orders/${encodeURIComponent(number)}/invoice`, { method: 'POST', body: {} });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Não foi possível solicitar a nota fiscal.';
    redirect(`/admin/pedidos/${encodeURIComponent(number)}?nfErro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/pedidos/${encodeURIComponent(number)}`);
  revalidatePath('/admin/bling');
  redirect(`/admin/pedidos/${encodeURIComponent(number)}?nfSolicitada=1`);
}

export async function setAutomaticBlingInvoiceAction(form: FormData) {
  const enabled = form.get('enabled') === 'true';
  const confirmed = form.get('fiscalConfirmed') === 'on';
  if (enabled && !confirmed) redirect('/admin/bling?fiscalConfirmacao=1');
  try {
    await adminFetch('/bling/invoice-settings/automatic', { method: 'POST', body: { enabled } });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Não foi possível salvar a configuração fiscal.';
    redirect(`/admin/bling?fiscalErro=${encodeURIComponent(message)}`);
  }
  revalidatePath('/admin/bling');
  redirect('/admin/bling?fiscalSalvo=1');
}

export async function addDomainAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch('/store/domains', { method: 'POST', body: { hostname: String(form.get('hostname') ?? '') } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/dominios');
  return { ok: 'Domínio cadastrado. Crie os registros abaixo no seu provedor de DNS e clique em Verificar.' };
}

export async function verifyDomainAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const result = await adminFetch<{ status: string; lastError: string | null }>(`/store/domains/${encodeURIComponent(String(form.get('id')))}/verify`, { method: 'POST', body: {} });
    revalidatePath('/admin/dominios');
    return result.status === 'ACTIVE' ? { ok: 'Domínio ativo: DNS e HTTPS validados.' } : { error: result.lastError ?? 'Ainda não foi possível validar.' };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function primaryDomainAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch(`/store/domains/${encodeURIComponent(String(form.get('id')))}/primary`, { method: 'POST', body: {} });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/dominios');
  return { ok: 'Domínio principal atualizado.' };
}

export async function removeDomainAction(form: FormData) {
  await adminFetch(`/store/domains/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/dominios');
}

export async function reconcileBlingAction(): Promise<{ report?: import('../../lib/admin/types').BlingReconciliation; error?: string }> {
  try {
    return { report: await adminFetch('/bling/reconciliation') };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function syncBlingStockAction(): Promise<FormState> {
  try {
    const result = await adminFetch<{ applied: number; skippedCount: number }>('/bling/stock-sync', { method: 'POST', body: {} });
    revalidatePath('/admin/bling');
    return { ok: `${result.applied} saldos atualizados com o Bling${result.skippedCount ? `; ${result.skippedCount} mantidos (pedido não enviado ou saldo reservado)` : ''}.` };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function setBlingStockSyncAction(form: FormData) {
  await adminFetch('/bling/stock-settings', { method: 'POST', body: { enabled: form.get('enabled') === 'true' } });
  revalidatePath('/admin/bling');
}

export async function shippingTestAction(zip: string): Promise<{ result?: import('../../lib/admin/types').ShippingTestResult; error?: string }> {
  try {
    return { result: await adminFetch('/diagnostics/shipping-test', { method: 'POST', body: { zip } }) };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function refundOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const number = String(form.get('number'));
  if (form.get('confirm') !== 'on') return { error: 'Marque a confirmação: o reembolso não pode ser desfeito.' };
  const amount = String(form.get('amount') ?? '').trim();
  try {
    await adminFetch(`/orders/${encodeURIComponent(number)}/refunds`, { method: 'POST', body: { ...(amount && { amount }), reason: String(form.get('reason') ?? '').trim(), mode: form.get('mode') === 'GATEWAY' ? 'GATEWAY' : 'MANUAL' } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin', 'layout');
  return { ok: 'Reembolso registrado.' };
}

export type ManualOrderLine = { productId: string; variantId?: string; quantity: number; unitPrice?: string };
export type ManualOrderPayload = {
  customer: { name: string; email: string; phone?: string; document?: string };
  shippingAddress?: { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string };
  items: ManualOrderLine[]; paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD'; paid: boolean; discount?: string; shipping?: string; shippingMethod?: string; note?: string;
};

/** Cria a venda manual; em sucesso o painel segue para o pedido. */
export async function createManualOrderAction(payload: ManualOrderPayload): Promise<{ error?: string }> {
  let number: string;
  try {
    number = (await adminFetch<{ number: string }>('/orders/manual', { method: 'POST', body: payload })).number;
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin', 'layout');
  redirect(`/admin/pedidos/${encodeURIComponent(number)}`);
}

export async function remindCartAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch(`/abandoned-carts/admin/${encodeURIComponent(String(form.get('id')))}/remind`, { method: 'POST', body: {} });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/carrinhos');
  return { ok: 'Lembrete enviado.' };
}

export type TemplateFormState = FormState & { preview?: { subject: string; text: string; html: string } };

function templateFields(form: FormData) {
  return { subject: String(form.get('subject') ?? ''), body: String(form.get('body') ?? '') };
}

export async function saveEmailTemplateAction(_: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  const key = encodeURIComponent(String(form.get('key')));
  try {
    await adminFetch(`/notifications/templates/${key}`, { method: 'PUT', body: { ...templateFields(form), enabled: form.get('enabled') === 'on' } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/emails');
  return { ok: 'Modelo salvo. Vale a partir do próximo e-mail.' };
}

export async function previewEmailTemplateAction(_: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  const key = encodeURIComponent(String(form.get('key')));
  try {
    const preview = await adminFetch<{ subject: string; text: string; html: string }>(`/notifications/templates/${key}/preview`, { method: 'POST', body: templateFields(form) });
    return { preview };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function restoreEmailTemplateAction(_: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  try {
    await adminFetch(`/notifications/templates/${encodeURIComponent(String(form.get('key')))}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/emails');
  return { ok: 'Voltou ao texto padrão.' };
}

export async function saveShippingOriginAction(_: FormState, form: FormData): Promise<FormState> {
  const zip = String(form.get('zipCode') ?? '').trim();
  try {
    await adminFetch('/shipping/origin', { method: 'PUT', body: { zipCode: zip ? zip : null } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/frete');
  revalidatePath('/admin/diagnostico');
  return { ok: zip ? 'CEP de origem salvo.' : 'CEP da loja removido. Vale o do servidor, se houver.' };
}

export async function saveCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id') ?? '');
  const segment = String(form.get('segment') ?? '');
  const audience = String(form.get('audience'));
  const body = { name: String(form.get('name') ?? '').trim(), subject: String(form.get('subject') ?? '').trim(), body: String(form.get('body') ?? '').trim(), audience, segment: audience === 'NEWSLETTER' || !segment ? null : segment };
  let createdId = '';
  try {
    if (id) await adminFetch(`/marketing/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    else createdId = (await adminFetch<{ id: string }>('/marketing/campaigns', { method: 'POST', body })).id;
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/campanhas');
  if (createdId) redirect(`/painel/campanhas/${createdId}`);
  return { ok: 'Rascunho salvo.' };
}

async function campaignCommand(form: FormData, path: string, body: unknown, ok: string): Promise<FormState> {
  const id = encodeURIComponent(String(form.get('id')));
  try {
    await adminFetch(`/marketing/campaigns/${id}/${path}`, { method: 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/campanhas');
  revalidatePath(`/admin/campanhas/${String(form.get('id'))}`);
  return { ok };
}
export const testCampaignAction = async (_: FormState, form: FormData) => campaignCommand(form, 'test', { email: String(form.get('email') ?? '').trim() }, 'Teste enviado. Confira a caixa de entrada (e o spam).');
export const sendCampaignAction = async (_: FormState, form: FormData) => campaignCommand(form, 'send', {}, 'Envio iniciado. Os e-mails saem aos poucos.');
export const cancelCampaignAction = async (_: FormState, form: FormData) => campaignCommand(form, 'cancel', {}, 'Envio cancelado.');

export async function deleteCampaignAction(form: FormData) {
  await adminFetch(`/marketing/campaigns/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/campanhas');
  redirect('/painel/campanhas');
}

export async function saveTrackingAction(_: FormState, form: FormData): Promise<FormState> {
  const text = (name: string) => String(form.get(name) ?? '').trim();
  try {
    await adminFetch('/seo/tracking', { method: 'PUT', body: { ga4: text('ga4'), gtm: text('gtm'), metaPixel: text('metaPixel'), googleVerification: text('googleVerification'), homeTitle: text('homeTitle'), homeDescription: text('homeDescription') } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/seo');
  return { ok: 'Salvo. A loja passa a usar essas informações em até 1 minuto.' };
}

export async function saveAutomationAction(payload: string, id?: string): Promise<FormState> {
  let body: unknown;
  try { body = JSON.parse(payload); } catch { return { error: 'Dados inválidos.' }; }
  try {
    await adminFetch(id ? `/automations/${encodeURIComponent(id)}` : '/automations', { method: id ? 'PATCH' : 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/automacoes');
  return { ok: id ? 'Automação salva.' : 'Automação criada (ela nasce desligada: confira e ligue na lista).' };
}

export async function toggleAutomationAction(form: FormData) {
  await adminFetch(`/automations/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { active: form.get('active') === 'true' } });
  revalidatePath('/admin/automacoes');
}

export async function deleteAutomationAction(form: FormData) {
  await adminFetch(`/automations/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/automacoes');
}

export async function usePresetAction(form: FormData) {
  await adminFetch(`/automations/presets/${encodeURIComponent(String(form.get('key')))}`, { method: 'POST', body: {} });
  revalidatePath('/admin/automacoes');
}

export async function saveLoyaltyConfigAction(_: FormState, form: FormData): Promise<FormState> {
  const num = (name: string) => Number(String(form.get(name) ?? '').replace(',', '.'));
  const body = {
    enabled: form.get('enabled') === 'on',
    pointsPerReal: num('pointsPerReal'), realPerPoint: num('realPerPoint'), minRedeem: Math.round(num('minRedeem')),
    silverFrom: Math.round(num('silverFrom')), goldFrom: Math.round(num('goldFrom')), diamondFrom: Math.round(num('diamondFrom')),
    silverPct: Math.round(num('silverPct')), goldPct: Math.round(num('goldPct')), diamondPct: Math.round(num('diamondPct')),
  };
  if (Object.values(body).some(value => typeof value === 'number' && Number.isNaN(value))) return { error: 'Preencha todos os campos com números.' };
  try {
    await adminFetch('/loyalty/config', { method: 'PUT', body });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/fidelidade');
  return { ok: 'Regras salvas. Valem para os próximos pedidos pagos e resgates.' };
}

export async function resetLoyaltyConfigAction(): Promise<void> {
  await adminFetch('/loyalty/config', { method: 'DELETE' });
  revalidatePath('/admin/fidelidade');
}

export async function addRedirectAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await adminFetch('/redirects', { method: 'POST', body: { from: String(form.get('from') ?? ''), to: String(form.get('to') ?? '') } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/redirecionamentos');
  return { ok: 'Redirecionamento salvo. Já vale para quem acessar o endereço antigo.' };
}

export async function importRedirectsAction(_: FormState, form: FormData): Promise<FormState> {
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return { error: 'Escolha o arquivo CSV com duas colunas: endereço antigo e endereço novo.' };
  if (file.size > 3_500_000) return { error: 'O arquivo passa de 3,5 MB. Divida a planilha em partes menores.' };
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/admin/login');
  const response = await fetch(`${serverApiUrl}/redirects/import`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/csv' }, body: await file.text(), cache: 'no-store' });
  if (response.status === 401) redirect('/admin/login');
  const body = await response.json().catch(() => undefined);
  if (!response.ok) return { error: (Array.isArray(body?.message) ? body.message.join('; ') : body?.message) || 'Não foi possível ler a planilha.' };
  revalidatePath('/admin/redirecionamentos');
  const skipped = (body.skipped ?? []) as { line: number; error: string }[];
  const detail = skipped.slice(0, 5).map(item => `linha ${item.line}: ${item.error}`).join('; ');
  return { ok: `${body.created} redirecionamentos criados.${skipped.length ? ` ${skipped.length} linhas puladas (${detail}${skipped.length > 5 ? '…' : ''}).` : ''}` };
}

export async function generateNuvemshopRedirectsAction(): Promise<FormState> {
  try {
    const result = await adminFetch<{ created: number }>('/redirects/nuvemshop', { method: 'POST', body: {} });
    revalidatePath('/admin/redirecionamentos');
    return { ok: result.created ? `${result.created} redirecionamentos criados.` : 'Nada novo para criar: todos os endereços já estão cadastrados.' };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

export async function deleteRedirectAction(form: FormData) {
  await adminFetch(`/redirects/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/redirecionamentos');
}

export async function moderateReviewAction(form: FormData) {
  const id = encodeURIComponent(String(form.get('id')));
  const status = String(form.get('status') ?? '');
  const body: Record<string, unknown> = {};
  if (['APPROVED', 'REJECTED', 'PENDING'].includes(status)) body.status = status;
  if (form.has('reply')) body.reply = String(form.get('reply') ?? '').trim() || null;
  await adminFetch(`/reviews/${id}`, { method: 'PATCH', body });
  revalidatePath('/admin/avaliacoes');
  revalidatePath('/produto/[slug]', 'page');
}

export async function deleteReviewAction(form: FormData) {
  await adminFetch(`/reviews/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
  revalidatePath('/admin/avaliacoes');
  revalidatePath('/produto/[slug]', 'page');
}

export async function saveBusinessProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const profile = { segment: String(form.get('segment') ?? ''), stage: String(form.get('stage') ?? ''), phone: String(form.get('phone') ?? ''), cnpj: String(form.get('cnpj') ?? ''), city: String(form.get('city') ?? '') };
  try {
    await adminFetch('/onboarding/profile', { method: 'PUT', body: { profile } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/primeiros-passos');
  return { ok: 'Dados salvos.' };
}

export async function setStoreOpenAction(_: FormState, form: FormData): Promise<FormState> {
  const open = form.get('open') === '1';
  try {
    await adminFetch(`/store/setup/${open ? 'open' : 'close'}`, { method: 'POST', body: {} });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin', 'layout');
  return { ok: open ? 'Sua loja está no ar!' : 'A loja voltou para “em construção”.' };
}

/** Instala um release publicado como rascunho inativo; não altera a vitrine ativa. */
export async function installThemeAction(form: FormData): Promise<void> {
  const releaseId = String(form.get('releaseId') ?? '').trim();
  if (!releaseId || releaseId.length > 100) redirect('/admin/site/temas?erro=Identificador+de+tema+inv%C3%A1lido.');
  try {
    await adminFetch('/themes/installations', { method: 'POST', body: { releaseId } });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Não foi possível instalar o tema.';
    redirect(`/admin/site/temas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath('/admin/site/temas');
  redirect('/admin/site/temas?instalado=1');
}


export type ThemeDraftSaveResult = { ok?: string; error?: string; revision?: number };

/** Salva somente o rascunho do novo Theme Engine; nunca publica nem ativa o tema. */
export async function saveThemeDraftAction(installationId: string, revision: number, documentJson: string): Promise<ThemeDraftSaveResult> {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(installationId) || !Number.isInteger(revision) || revision < 1 || documentJson.length > 262_144) {
    return { error: 'Os dados do rascunho são inválidos.' };
  }
  let document: unknown;
  try { document = JSON.parse(documentJson); } catch { return { error: 'O documento do tema está malformado.' }; }
  try {
    const saved = await adminFetch<{ revision: number }>(`/themes/installations/${encodeURIComponent(installationId)}/draft`, { method: 'PATCH', body: { revision, document } });
    revalidatePath(`/admin/site/temas/${encodeURIComponent(installationId)}`);
    revalidatePath('/admin/site/temas');
    return { ok: 'Rascunho salvo. A loja publicada não foi alterada.', revision: saved.revision };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}
