import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('rascunho e publicação da vitrine', () => {
  it('salva privado, publica atomicamente, preserva o original e restaura sem publicar', async () => {
    const { store } = await createStore();
    await prisma.store.update({ where: { id: store.id }, data: { themeConfig: { heroTitle: 'Original' } } });
    const token = await login(api, store, ['settings.write']);
    const save = await api('/store/storefront/draft', { method: 'PATCH', token, body: { version: 0, config: { heroTitle: 'Campanha privada' } } });
    expect(save).toMatchObject({ status: 200, body: { version: 1 } });
    const publicDraft = await api('/store/public/' + store.slug);
    expect(publicDraft.body.themeConfig.heroTitle).toBe('Original');
    expect(publicDraft.body).not.toHaveProperty('draft');
    expect(publicDraft.body).not.toHaveProperty('draftThemeConfig');
    expect((await api('/store/storefront', { token })).body.draft.heroTitle).toBe('Campanha privada');

    const published = await api('/store/storefront/publish', { method: 'POST', token, body: { version: 1, config: { heroTitle: 'Campanha publicada' } } });
    expect(published).toMatchObject({ status: 200, body: { version: 2 } });
    expect((await api('/store/public/' + store.slug)).body.themeConfig.heroTitle).toBe('Campanha publicada');
    const state = (await api('/store/storefront', { token })).body;
    expect(state.draft).toBeNull();
    expect(state.publications).toHaveLength(2);
    expect(state.publishedAt).not.toBeNull();

    const original = state.publications.find((item: { version: number }) => item.version === 0);
    expect((await api('/store/storefront/restore', { method: 'POST', token, body: { version: 2, publicationId: original.id } })).status).toBe(200);
    expect((await api('/store/storefront', { token })).body.draft.heroTitle).toBe('Original');
    expect((await api('/store/public/' + store.slug)).body.themeConfig.heroTitle).toBe('Campanha publicada');
    const events = await prisma.outboxEvent.findMany({ where: { storeId: store.id, eventName: 'StorefrontPublished' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ version: 2, actorId: expect.any(String) });
  });

  it('apenas uma edição concorrente vence e não há perda silenciosa', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const results = await Promise.all(['Primeira aba', 'Segunda aba'].map(heroTitle =>
      api('/store/storefront/draft', { method: 'PATCH', token, body: { version: 0, config: { heroTitle } } }),
    ));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const state = (await api('/store/storefront', { token })).body;
    expect(state.version).toBe(1);
    expect((await api('/store/storefront/publish', { method: 'POST', token, body: { version: 0, config: { heroTitle: 'Obsoleto' } } })).status).toBe(409);
    expect(await prisma.storefrontPublication.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('protege rascunho e histórico por autenticação, permissão e loja', async () => {
    const first = await createStore();
    const second = await createStore();
    const token = await login(api, first.store, ['settings.write']);
    const denied = await login(api, first.store, ['catalog.write']);
    const other = await prisma.storefrontPublication.create({ data: { storeId: second.store.id, version: 1, config: { heroTitle: 'Outra loja' } } });
    expect((await api('/store/storefront')).status).toBe(401);
    expect((await api('/store/storefront', { token: denied })).status).toBe(403);
    expect((await api('/store/setup', { token: denied })).status).toBe(403);
    expect((await api('/store/storefront/restore', { method: 'POST', token, body: { version: 0, publicationId: other.id } })).status).toBe(404);
    expect((await api('/store/storefront', { token })).body.publications).toEqual([]);
    expect((await api('/store/storefront/draft', { method: 'PATCH', token, body: { version: 0, config: { heroTitle: 'Válido' }, storeId: second.store.id } })).status).toBe(400);
  });

  it('rejeita configurações inseguras sem modificar a versão', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    for (const config of [{ heroImageUrl: 'javascript:alert(1)' }, { script: '<script>' }, { heroTitle: 'x'.repeat(121) }]) {
      expect((await api('/store/storefront/publish', { method: 'POST', token, body: { version: 0, config } })).status).toBe(400);
    }
    expect((await api('/store/storefront', { token })).body.version).toBe(0);
  });

  it('mantém compatibilidade da publicação anterior sem perder histórico', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    expect((await api('/store', { method: 'PATCH', token, body: { themeConfig: { heroTitle: 'Compatível' } } })).status).toBe(200);
    const state = (await api('/store/storefront', { token })).body;
    expect(state.version).toBe(1);
    expect(state.publications).toHaveLength(2);
    expect(state.published.heroTitle).toBe('Compatível');
  });
});

describe('guia de configuração', () => {
  it('recalcula pendências e não considera estoque reservado ou dados de outra loja', async () => {
    const first = await createStore(1);
    const second = await createStore(20);
    const token = await login(api, first.store, ['settings.write']);
    await prisma.shippingRule.create({ data: { storeId: second.store.id, name: 'Entrega', states: [], price: 10, minDays: 1, maxDays: 2 } });
    await prisma.inventory.updateMany({ where: { storeId: first.store.id }, data: { reserved: 1 } });
    const before = (await api('/store/setup', { token })).body;
    expect(before.steps.find((s: { id: string }) => s.id === 'catalog').complete).toBe(false);
    expect(before.steps.find((s: { id: string }) => s.id === 'shipping').complete).toBe(false);
    expect(JSON.stringify(before)).not.toContain('ACCESS_TOKEN');
    await prisma.inventory.updateMany({ where: { storeId: first.store.id }, data: { reserved: 0 } });
    await prisma.shippingRule.create({ data: { storeId: first.store.id, name: 'Entrega', states: ['SP'], price: 10, minDays: 1, maxDays: 2 } });
    const after = (await api('/store/setup', { token })).body;
    expect(after.steps.find((s: { id: string }) => s.id === 'catalog').complete).toBe(true);
    expect(after.steps.find((s: { id: string }) => s.id === 'shipping').complete).toBe(true);
    expect(after.completed).toBe(before.completed + 2);
  });
});
