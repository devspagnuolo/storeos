import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('menus da vitrine', () => {
  it('sem menu salvo a vitrine usa o padrão; salvo, devolve endereços e esconde destinos removidos', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    expect((await api(`/content/menus/main?store=${store.slug}`)).body).toEqual({ configured: false, items: [] });

    const blusas = await prisma.category.create({ data: { storeId: store.id, slug: 'blusas', name: 'Blusas' } });
    await prisma.category.create({ data: { storeId: store.id, slug: 'regatas', name: 'Regatas', parentId: blusas.id } });
    await prisma.page.create({ data: { storeId: store.id, slug: 'trocas', title: 'Trocas', body: 'x', published: true } });

    const opts = await api('/content/admin/menus/main', { token: admin });
    expect(opts.body.configured).toBe(false);
    expect(opts.body.options.categories.map((c: { slug: string }) => c.slug).sort()).toContain('regatas');

    const saved = await api('/content/admin/menus/main', { method: 'PUT', token: admin, body: { items: [
      { label: 'Blusas', type: 'CATEGORY', ref: 'blusas', children: [{ label: 'Regatas', type: 'CATEGORY', ref: 'regatas' }] },
      { label: 'Trocas', type: 'PAGE', ref: 'trocas' },
      { label: 'WhatsApp', type: 'LINK', ref: 'https://wa.me/5521999999999' },
    ] } });
    expect(saved.status).toBe(200);
    expect(saved.body.configured).toBe(true);

    const pub = await api(`/content/menus/main?store=${store.slug}`);
    expect(pub.body.items).toEqual([
      { label: 'Blusas', href: '/categorias/blusas', children: [{ label: 'Regatas', href: '/categorias/regatas', children: [] }] },
      { label: 'Trocas', href: '/p/trocas', children: [] },
      { label: 'WhatsApp', href: 'https://wa.me/5521999999999', children: [] },
    ]);

    // Despublicar a página tira o item do menu, sem link quebrado.
    await prisma.page.updateMany({ where: { storeId: store.id }, data: { published: false } });
    expect((await api(`/content/menus/main?store=${store.slug}`)).body.items.map((i: { label: string }) => i.label)).toEqual(['Blusas', 'WhatsApp']);

    expect((await api('/content/admin/menus/main', { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api(`/content/menus/main?store=${store.slug}`)).body.configured).toBe(false);
  });

  it('valida a estrutura, isola lojas e exige permissão', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    const bad = (items: unknown) => api('/content/admin/menus/main', { method: 'PUT', token: admin, body: { items } });
    expect((await bad([{ label: 'X', type: 'LINK', ref: 'javascript:alert(1)' }])).status).toBe(400);
    expect((await bad([{ label: 'X', type: 'CATEGORY' }])).status).toBe(400);
    expect((await api('/content/admin/menus/rodape', { token: admin })).status).toBe(404);
    expect((await api('/content/admin/menus/main', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
  });
});
