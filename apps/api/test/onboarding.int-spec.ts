import { NestExpressApplication } from '@nestjs/platform-express';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
const sent: { to: string; text: string }[] = [];

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue({ send: async (m: { to: string; text: string }) => { sent.push(m); return { id: 'x' }; } })));
});
afterAll(() => { delete process.env.SIGNUP_ENABLED; return cleanup(app); });

const body = (over: Record<string, unknown> = {}) => ({ ownerName: 'Maria Souza', email: `maria-${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'uma-senha-bem-forte-9', storeName: `Moda Teste ${Math.random().toString(36).slice(2, 8)}`, acceptTerms: true, ...over });

describe('criação de loja', () => {
  it('fica fechada enquanto SIGNUP_ENABLED não estiver ligado', async () => {
    delete process.env.SIGNUP_ENABLED;
    expect((await api('/onboarding/status')).body).toEqual({ enabled: false });
    expect((await api('/onboarding/signup', { method: 'POST', body: body() })).status).toBe(404);
  });

  it('cria loja e dono, exige confirmar o e-mail e só então deixa entrar', async () => {
    process.env.SIGNUP_ENABLED = 'true';
    const input = body();
    expect((await api('/onboarding/signup', { method: 'POST', body: { ...input, password: 'curta' } })).status).toBe(400);
    expect((await api('/onboarding/signup', { method: 'POST', body: { ...input, acceptTerms: false } })).status).toBe(400);
    const created = await api('/onboarding/signup', { method: 'POST', body: input });
    expect(created.status).toBe(201);
    const slug = created.body.storeSlug as string;
    expect((await api(`/onboarding/slug?slug=${slug}`)).body.available).toBe(false);

    const blocked = await api('/auth/login', { method: 'POST', body: { email: input.email, password: input.password, storeSlug: slug } });
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    const mail = sent.find(m => m.to === input.email.toLowerCase());
    const token = mail?.text.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    expect((await api('/onboarding/verify', { method: 'POST', body: { token: 'x'.repeat(30) } })).status).toBe(400);
    expect((await api('/onboarding/verify', { method: 'POST', body: { token } })).status).toBe(200);
    expect((await api('/onboarding/verify', { method: 'POST', body: { token } })).status).toBe(400);

    const ok = await api('/auth/login', { method: 'POST', body: { email: input.email, password: input.password, storeSlug: slug } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.permissions).toContain('settings.write');
    const saved = await api('/onboarding/profile', { method: 'PUT', token: ok.body.accessToken, body: { profile: { segment: 'moda', stage: 'starting', city: 'Campinas' } } });
    expect(saved.status).toBe(200);
    expect((await api('/onboarding/profile', { token: ok.body.accessToken })).body.city).toBe('Campinas');
  });

  it('reenvia a confirmação sem revelar quem tem conta, e links vencidos não valem', async () => {
    process.env.SIGNUP_ENABLED = 'true';
    const input = body();
    const { body: created } = await api('/onboarding/signup', { method: 'POST', body: input });
    const before = sent.length;
    expect((await api('/onboarding/resend', { method: 'POST', body: { storeSlug: created.storeSlug, email: 'ninguem@example.com' } })).body).toEqual({ sent: true });
    expect(sent.length).toBe(before);
    await api('/onboarding/resend', { method: 'POST', body: { storeSlug: created.storeSlug, email: input.email } });
    expect(sent.length).toBe(before + 1);
    await prisma.user.updateMany({ where: { email: input.email.toLowerCase() }, data: { verificationExpiresAt: new Date(Date.now() - 1000) } });
    const token = sent[sent.length - 1].text.match(/token=([\w-]+)/)?.[1];
    expect((await api('/onboarding/verify', { method: 'POST', body: { token } })).status).toBe(400);
  });

  it('loja nova nasce fechada, não vende, e só abre quando o essencial está pronto', async () => {
    const { store, product } = await createStore(5);
    await prisma.store.update({ where: { id: store.id }, data: { storefrontOpen: false } });
    const admin = await login(api, store, ['settings.write']);
    expect((await api(`/store/public/${store.slug}`)).body.open).toBe(false);
    const blocked = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('STORE_CLOSED');

    const early = await api('/store/setup/open', { method: 'POST', token: admin, body: {} });
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('LAUNCH_BLOCKED');
    expect(early.body.blockers).toEqual(expect.arrayContaining(['profile', 'identity', 'appearance', 'shipping', 'policies']));

    Object.assign(process.env, { MERCADOPAGO_ACCESS_TOKEN: 't', MERCADOPAGO_WEBHOOK_SECRET: 's', API_PUBLIC_URL: 'https://api.example.com' });
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: 'https://img.example.com/l.png', themeConfig: { heroTitle: 'Olá' } } });
    await prisma.productImage.create({ data: { productId: product.id, url: 'https://img.example.com/p.png' } });
    await prisma.shippingRule.create({ data: { storeId: store.id, name: 'Brasil', states: ['SP'], price: '10', minDays: 2, maxDays: 5 } });
    await prisma.page.createMany({ data: [{ storeId: store.id, slug: 'trocas-e-devolucoes', title: 'Trocas', body: 'x', published: true }, { storeId: store.id, slug: 'politica-de-privacidade', title: 'Privacidade', body: 'x', published: true }] });
    expect((await api('/onboarding/profile', { method: 'PUT', token: admin, body: { profile: { segment: 'moda' } } })).status).toBe(200);

    expect((await api('/store/setup/open', { method: 'POST', token: admin, body: {} })).status).toBe(200);
    expect((await api(`/store/public/${store.slug}`)).body.open).toBe(true);
    const sold = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    expect(sold.body.code).not.toBe('STORE_CLOSED');
    expect((await api('/store/setup/close', { method: 'POST', token: admin, body: {} })).body.open).toBe(false);
    for (const k of ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'API_PUBLIC_URL']) delete process.env[k];
  });

  it('limpa só cadastros nunca confirmados, vencidos há dias, sem produtos nem pedidos', async () => {
    const { OnboardingService } = await import('../src/modules/onboarding/onboarding.service');
    const service = app.get(OnboardingService);
    const tag = Math.random().toString(36).slice(2, 8);
    const old = new Date(Date.now() - 10 * 86_400_000);
    const make = async (suffix: string, user: Record<string, unknown>) => {
      const store = await prisma.store.create({ data: { slug: `test-unv-${tag}-${suffix}`, name: 'Cadastro', storefrontOpen: false } });
      await prisma.user.create({ data: { storeId: store.id, email: `${suffix}@example.com`, name: 'Dono', passwordHash: 'x', ...user } });
      return store;
    };
    const stale = await make('stale', { verificationHash: `h-${tag}-1`, verificationExpiresAt: old });
    const recent = await make('recent', { verificationHash: `h-${tag}-2`, verificationExpiresAt: new Date(Date.now() + 86_400_000) });
    const verified = await make('verified', { emailVerifiedAt: old });
    const withProduct = await make('product', { verificationHash: `h-${tag}-3`, verificationExpiresAt: old });
    await prisma.product.create({ data: { storeId: withProduct.id, slug: 'p', sku: `P-${tag}`, name: 'P', price: '1.00', status: 'ACTIVE' } });

    await service.purgeUnverified();
    const alive = async (id: string) => Boolean(await prisma.store.findUnique({ where: { id } }));
    expect(await alive(stale.id)).toBe(false);
    expect(await alive(recent.id)).toBe(true);
    expect(await alive(verified.id)).toBe(true);
    expect(await alive(withProduct.id)).toBe(true);
  });
});
