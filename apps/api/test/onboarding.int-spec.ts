import { NestExpressApplication } from '@nestjs/platform-express';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider';
import { cleanup, prisma, startApp } from './helpers';

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
});
