import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';
import { MAIL_PROVIDER, MailProvider, OutgoingMail } from '../src/modules/notifications/mail-provider';
import { MarketingCampaignsService } from '../src/modules/marketing/marketing-campaigns.service';
import { makeUnsubscribeToken } from '../src/modules/marketing/campaign-rules';

class FakeMail implements MailProvider {
  sent: OutgoingMail[] = [];
  failFor = new Set<string>();
  async send(mail: OutgoingMail) {
    if (this.failFor.has(mail.to)) throw new Error('provedor fora do ar');
    this.sent.push(mail);
    return { status: 'SENT' as const, providerId: 'm1' };
  }
}

const fake = new FakeMail();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let marketing: MarketingCampaignsService;

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  process.env.MARKETING_WORKER = 'off';
  process.env.MARKETING_EMAIL_BATCH = '20';
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue(fake)));
  marketing = app.get(MarketingCampaignsService);
});
afterAll(() => cleanup(app));

const drain = async () => { for (let i = 0; i < 10; i++) if (!(await marketing.processDue())) break; };

describe('campanhas de e-mail', () => {
  it('monta o público sem repetir e-mail, envia com descadastro e respeita quem saiu', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['marketing.write']);
    await prisma.newsletterSubscriber.createMany({ data: [{ storeId: store.id, email: 'ana@x.com', name: 'Ana Souza' }, { storeId: store.id, email: 'saiu@x.com', unsubscribedAt: new Date() }, { storeId: store.id, email: 'bia@x.com' }] });
    await prisma.customer.createMany({ data: [
      { storeId: store.id, email: 'ana@x.com', name: 'Ana Souza', marketingOptIn: true },
      { storeId: store.id, email: 'caio@x.com', name: 'Caio Lima', marketingOptIn: true },
      { storeId: store.id, email: 'dani@x.com', name: 'Dani', marketingOptIn: false },
      { storeId: store.id, email: 'saiu@x.com', name: 'Saiu', marketingOptIn: true },
    ] });

    expect((await api('/marketing/audience?audience=ALL', { token: admin })).body).toEqual({ count: 3 }); // ana, bia, caio
    expect((await api('/marketing/audience?audience=NEWSLETTER', { token: admin })).body).toEqual({ count: 2 });
    expect((await api('/marketing/audience?audience=CUSTOMERS', { token: admin })).body).toEqual({ count: 2 }); // ana e caio; saiu é barrado

    const bad = await api('/marketing/campaigns', { method: 'POST', token: admin, body: { name: 'X', subject: 'Olá {{cupom}}', body: 'texto de teste longo', audience: 'ALL' } });
    expect(bad.status).toBe(400);
    const created = await api('/marketing/campaigns', { method: 'POST', token: admin, body: { name: 'Coleção nova', subject: '{{nome}}, chegou a coleção', body: 'Oi {{nome}}!\n\nConfira em https://loja.example.com/colecao', audience: 'ALL' } });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const test = await api(`/marketing/campaigns/${id}/test`, { method: 'POST', token: admin, body: { email: 'dono@loja.com' } });
    expect(test.body).toEqual({ status: 'SENT' });
    expect(fake.sent.at(-1)).toMatchObject({ to: 'dono@loja.com' });
    expect(fake.sent.at(-1)!.subject.startsWith('[Teste]')).toBe(true);

    fake.sent = [];
    fake.failFor.add('bia@x.com');
    const started = await api(`/marketing/campaigns/${id}/send`, { method: 'POST', token: admin });
    expect(started.body).toEqual({ recipients: 3 });
    expect((await api(`/marketing/campaigns/${id}/send`, { method: 'POST', token: admin })).status).toBe(400);
    await drain();

    const sentTo = fake.sent.map(m => m.to).sort();
    expect(sentTo).toEqual(['ana@x.com', 'caio@x.com']);
    const ana = fake.sent.find(m => m.to === 'ana@x.com')!;
    expect(ana.subject).toBe('Ana, chegou a coleção');
    expect(ana.text).toContain('https://loja.example.com/descadastro/');
    expect(ana.headers?.['List-Unsubscribe']).toContain('/descadastro/');

    const detail = (await api(`/marketing/campaigns/${id}`, { token: admin })).body;
    expect(detail).toMatchObject({ status: 'SENT', counts: { total: 3, sent: 2, failed: 1, pending: 0 } });
    expect(detail.failures[0]).toMatchObject({ email: 'bia@x.com' });
    expect(await prisma.emailCampaignRecipient.findFirstOrThrow({ where: { campaignId: id, email: 'bia@x.com' } })).toMatchObject({ attempts: 3, status: 'FAILED' });

    // Descadastro: o GET só mostra a confirmação; o POST tira da lista de newsletter e de clientes.
    const token = makeUnsubscribeToken(store.id, 'Ana@x.com');
    expect((await api(`/marketing/unsubscribe/${token}`)).body).toMatchObject({ storeName: 'Loja Teste', email: 'an***@x.com' });
    expect((await prisma.newsletterSubscriber.findFirstOrThrow({ where: { storeId: store.id, email: 'ana@x.com' } })).unsubscribedAt).toBeNull();
    expect((await api(`/marketing/unsubscribe/${token}`, { method: 'POST' })).body).toEqual({ unsubscribed: true });
    expect((await prisma.newsletterSubscriber.findFirstOrThrow({ where: { storeId: store.id, email: 'ana@x.com' } })).unsubscribedAt).not.toBeNull();
    expect((await prisma.customer.findFirstOrThrow({ where: { storeId: store.id, email: 'ana@x.com' } })).marketingOptIn).toBe(false);
    expect((await api('/marketing/audience?audience=ALL', { token: admin })).body).toEqual({ count: 2 }); // bia, caio
    expect((await api('/marketing/unsubscribe/lixo.assinatura', { method: 'POST' })).status).toBe(404);
  });

  it('só edita rascunho, cancela envio e isola por loja e permissão', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['marketing.write']);
    const reader = await login(api, store, ['orders.read']);
    await prisma.newsletterSubscriber.create({ data: { storeId: store.id, email: 'eva@x.com' } });
    expect((await api('/marketing/campaigns', { token: reader })).status).toBe(403);
    const created = await api('/marketing/campaigns', { method: 'POST', token: admin, body: { name: 'Promo', subject: 'Promoção de hoje', body: 'Tudo com desconto na loja hoje', audience: 'NEWSLETTER' } });
    const id = created.body.id as string;
    expect((await api(`/marketing/campaigns/${id}`, { method: 'PATCH', token: admin, body: { subject: 'Promoção da semana' } })).body.subject).toBe('Promoção da semana');
    expect((await api(`/marketing/campaigns/${id}`, { token: await login(api, other.store, ['marketing.write']) })).status).toBe(404);
    await api(`/marketing/campaigns/${id}/send`, { method: 'POST', token: admin });
    expect((await api(`/marketing/campaigns/${id}`, { method: 'PATCH', token: admin, body: { subject: 'Outro' } })).status).toBe(400);
    const cancelled = await api(`/marketing/campaigns/${id}/cancel`, { method: 'POST', token: admin });
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', counts: { total: 1, pending: 1 } });
    fake.sent = [];
    await drain();
    expect(fake.sent.filter(m => m.to === 'eva@x.com')).toHaveLength(0);
    expect((await api(`/marketing/campaigns/${id}`, { method: 'DELETE', token: admin })).status).toBe(204);
  });
});
