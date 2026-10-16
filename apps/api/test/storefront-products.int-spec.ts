import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('vitrine com produtos escolhidos', () => {
  it('lista só ativos da própria loja, na ordem escolhida, e o painel resolve os ids', async () => {
    const { store, product, draft } = await createStore(5);
    const other = await createStore(5);
    const second = await prisma.product.create({ data: { storeId: store.id, slug: 'cesto', sku: 'CESTO-1', name: 'Cesto', price: '20.00', status: 'ACTIVE' } });
    const ids = [second.id, product.id, draft.id, other.product.id].join(',');
    const pub = await api(`/catalog/products?store=${store.slug}&ids=${ids}&pageSize=24`);
    expect(pub.status).toBe(200);
    expect(pub.body.items.map((p: { id: string }) => p.id)).toEqual([second.id, product.id]);

    const admin = await login(api, store, ['catalog.write']);
    const panel = await api(`/catalog/admin/products?ids=${draft.id},${product.id},${other.product.id}`, { token: admin });
    expect(panel.body.items.map((p: { id: string }) => p.id).sort()).toEqual([draft.id, product.id].sort());

    const editor = await login(api, store, ['settings.write']);
    const saved = await api('/store/storefront/draft', { method: 'PATCH', token: editor, body: { version: 0, config: { home: { sections: [{ id: 'dest', type: 'products', hidden: false, props: { productIds: [second.id, product.id] } }] } } } });
    expect(saved.status).toBe(200);
    const bad = await api('/store/storefront/draft', { method: 'PATCH', token: editor, body: { version: 1, config: { home: { sections: [{ id: 'dest', type: 'products', hidden: false, props: { productIds: ['nao-e-id'] } }] } } } });
    expect(bad.status).toBe(400);

    const pages = await api('/store/storefront/draft', { method: 'PATCH', token: editor, body: { version: 1, config: { pages: { category: { sections: [{ id: 'aviso', type: 'text', hidden: false, props: { body: 'Frete grátis' } }] }, product: { sections: [{ id: 'rel', type: 'products', hidden: false, props: { productIds: [product.id] } }] } } } } });
    expect(pages.status).toBe(200);
    const state = await api('/store/storefront', { token: editor });
    expect(state.body.draft.pages.category.sections[0].props.body).toBe('Frete grátis');
    const wrongPage = await api('/store/storefront/draft', { method: 'PATCH', token: editor, body: { version: 2, config: { pages: { category: { sections: [{ id: 'h', type: 'hero', hidden: false, props: {} }] } } } } });
    expect(wrongPage.status).toBe(400);
  });
});

describe('sugestões do carrinho', () => {
  it('traz primeiro a mesma categoria, só com saldo, sem repetir o carrinho nem outras lojas', async () => {
    const { store, product } = await createStore(5);
    const other = await createStore(5);
    const category = await prisma.category.findFirstOrThrow({ where: { storeId: store.id } });
    const make = async (slug: string, stock: number, categoryId?: string) => {
      const created = await prisma.product.create({ data: { storeId: store.id, slug, sku: slug.toUpperCase(), name: slug, price: '30.00', status: 'ACTIVE', ...(categoryId && { categories: { create: { categoryId } } }) } });
      await prisma.inventory.create({ data: { storeId: store.id, productId: created.id, quantity: stock } });
      return created;
    };
    const same = await make('prato', 3, category.id);
    await make('esgotado', 0, category.id);
    const newest = await make('novo', 2);
    const result = await api(`/catalog/recommendations?store=${store.slug}&ids=${product.id},${other.product.id}`);
    expect(result.status).toBe(200);
    expect(result.body.items.map((p: { id: string }) => p.id)).toEqual([same.id, newest.id]);
    expect(result.body.items[0]).not.toHaveProperty('inventory');
  });
});
