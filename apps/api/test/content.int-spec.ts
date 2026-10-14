import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('páginas institucionais', () => {
  it('só publica o que o lojista liberou, edita, remove e isola por loja', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['settings.write']);

    const draft = await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'trocas', title: 'Trocas e devoluções', body: 'Aceitamos trocas em até 7 dias.' } });
    expect(draft.status).toBe(201);
    expect((await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'trocas', title: 'Outra', body: 'x' } })).status).toBe(409);
    expect((await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'Inválida!', title: 'Ruim', body: 'x' } })).status).toBe(400);

    // Rascunho não aparece para o público.
    expect((await api(`/content/pages/trocas?store=${store.slug}`)).status).toBe(404);
    expect((await api(`/content/pages?store=${store.slug}`)).body).toEqual([]);

    await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: admin, body: { published: true, title: 'Trocas e devoluções (CDC)' } });
    const page = await api(`/content/pages/trocas?store=${store.slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ title: 'Trocas e devoluções (CDC)', body: 'Aceitamos trocas em até 7 dias.' });
    expect((await api(`/content/pages?store=${store.slug}`)).body).toEqual([{ slug: 'trocas', title: 'Trocas e devoluções (CDC)', showInFooter: true }]);

    // Outra loja não vê nem edita.
    expect((await api(`/content/pages/trocas?store=${other.store.slug}`)).status).toBe(404);
    const outsider = await login(api, other.store, ['settings.write']);
    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: outsider, body: { title: 'Invadida' } })).status).toBe(404);
    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'DELETE', token: outsider })).status).toBe(404);
    expect((await api('/content/admin/pages', { token: await login(api, store, ['orders.read']) })).status).toBe(403);

    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api(`/content/pages/trocas?store=${store.slug}`)).status).toBe(404);
  });
});
