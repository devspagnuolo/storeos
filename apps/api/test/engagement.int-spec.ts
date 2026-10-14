import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

beforeAll(async () => {
  ({ app, api } = await startApp());
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(() => cleanup(app));

describe('banners', () => {
  it('cria, ordena, agenda e só publica os que estão no ar', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    const make = (body: object) => api('/engagement/admin/banners', { method: 'POST', token: admin, body });

    const a = await make({ imageUrl: 'https://img.example/a.jpg', title: 'Primavera', ctaLabel: 'Ver', linkUrl: '/categorias/vestidos' });
    const b = await make({ imageUrl: 'https://img.example/b.jpg', linkUrl: 'https://wa.me/5521999998888' });
    await make({ imageUrl: 'https://img.example/c.jpg', active: false });
    await make({ imageUrl: 'https://img.example/d.jpg', startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    await make({ imageUrl: 'https://img.example/e.jpg', endsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect([a.status, a.body.position, b.body.position]).toEqual([201, 0, 1]);

    const pub = await api(`/engagement/banners?store=${store.slug}`);
    expect(pub.body.map((x: { imageUrl: string }) => x.imageUrl)).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg']);
    expect(pub.body[0]).toMatchObject({ title: 'Primavera', ctaLabel: 'Ver', linkUrl: '/categorias/vestidos' });

    // Reordenar e desativar.
    await api(`/engagement/admin/banners/${a.body.id}`, { method: 'PATCH', token: admin, body: { position: 9 } });
    expect((await api(`/engagement/banners?store=${store.slug}`)).body[0].imageUrl).toBe('https://img.example/b.jpg');
    await api(`/engagement/admin/banners/${b.body.id}`, { method: 'PATCH', token: admin, body: { active: false } });
    expect((await api(`/engagement/banners?store=${store.slug}`)).body).toHaveLength(1);
    expect((await api('/engagement/admin/banners', { token: admin })).body).toHaveLength(5);
    expect((await api(`/engagement/admin/banners/${a.body.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api(`/engagement/admin/banners/${a.body.id}`, { method: 'DELETE', token: admin })).status).toBe(404);
  });

  it('recusa imagem sem HTTPS, link perigoso, datas invertidas e outra loja', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['settings.write']);
    const make = (body: object) => api('/engagement/admin/banners', { method: 'POST', token: admin, body });
    expect((await make({ imageUrl: 'http://img.example/a.jpg' })).status).toBe(400);
    expect((await make({ imageUrl: 'https://img.example/a.jpg', linkUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await make({ imageUrl: 'https://img.example/a.jpg', startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' })).status).toBe(400);
    const mine = await make({ imageUrl: 'https://img.example/a.jpg' });
    const intruder = await login(api, other.store, ['settings.write']);
    expect((await api(`/engagement/admin/banners/${mine.body.id}`, { method: 'PATCH', token: intruder, body: { title: 'x' } })).status).toBe(404);
    expect((await api('/engagement/admin/banners', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
  });
});

describe('whatsapp', () => {
  it('normaliza o número, aparece na loja pública e pode ser removido', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    const saved = await api('/engagement/admin/whatsapp', { method: 'PUT', token: admin, body: { number: '(21) 99999-8888', message: 'Oi! Vim pelo site.' } });
    expect(saved.body).toEqual({ whatsappNumber: '5521999998888', whatsappMessage: 'Oi! Vim pelo site.' });
    expect((await api(`/store/public/${store.slug}`)).body).toMatchObject({ whatsappNumber: '5521999998888', whatsappMessage: 'Oi! Vim pelo site.' });
    expect((await api('/engagement/admin/whatsapp', { method: 'PUT', token: admin, body: { number: '123' } })).status).toBe(400);
    const cleared = await api('/engagement/admin/whatsapp', { method: 'PUT', token: admin, body: { number: null } });
    expect(cleared.body).toEqual({ whatsappNumber: null, whatsappMessage: null });
  });
});

describe('newsletter', () => {
  it('inscreve sem duplicar, reativa quem saiu e exporta só os ativos', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['marketing.write']);
    const join = (email: string, name?: string) => api('/engagement/newsletter', { method: 'POST', body: { storeSlug: store.slug, email, name } });

    expect((await join('Maria@Example.com', 'Maria')).body).toEqual({ subscribed: true });
    expect((await join('maria@example.com')).status).toBe(200); // repetido: mesma resposta, sem erro
    await join('joao@example.com');
    expect((await api('/engagement/newsletter', { method: 'POST', body: { storeSlug: store.slug, email: 'invalido' } })).status).toBe(400);
    expect((await api('/engagement/newsletter', { method: 'POST', body: { storeSlug: 'nao-existe', email: 'a@b.co' } })).status).toBe(404);

    const list = await api('/engagement/admin/newsletter', { token: admin });
    expect(list.body.total).toBe(2);
    const maria = list.body.items.find((s: { email: string }) => s.email === 'maria@example.com');
    expect(maria).toMatchObject({ name: 'Maria', source: 'site' });

    await api(`/engagement/admin/newsletter/${maria.id}`, { method: 'DELETE', token: admin });
    expect((await api('/engagement/admin/newsletter', { token: admin })).body.total).toBe(1);
    const csv = await (await fetch(`${baseUrl}/api/v1/engagement/admin/newsletter/export.csv`, { headers: { authorization: `Bearer ${admin}` } })).text();
    expect(csv).toContain('E-mail;Nome;Origem;Inscrito em');
    expect(csv).toContain('joao@example.com');
    expect(csv).not.toContain('maria@example.com');

    // Quem saiu e volta a se inscrever é reativado, sem linha nova.
    await join('maria@example.com');
    expect((await api('/engagement/admin/newsletter', { token: admin })).body.total).toBe(2);
    expect(await prisma.newsletterSubscriber.count({ where: { storeId: store.id } })).toBe(2);
    expect((await api('/engagement/admin/newsletter', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
  });
});
