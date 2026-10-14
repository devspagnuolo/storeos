import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('categorias e subcategorias', () => {
  it('cria árvore de dois níveis, filtra pela categoria principal e preserva produtos ao excluir', async () => {
    const { store, product } = await createStore();
    const token = await login(api, store, ['catalog.write']);
    const parent = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Camisetas', slug: 'camisetas' } });
    const child = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Polo', slug: 'polo', parentId: parent.body.id } });
    expect(child.status).toBe(201);

    // Não há terceiro nível, nem categoria pai de outra loja.
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'Neta', slug: 'neta', parentId: child.body.id } })).status).toBe(400);
    const other = await createStore();
    const foreign = await prisma.category.findFirstOrThrow({ where: { storeId: other.store.id } });
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'Fora', slug: 'fora', parentId: foreign.id } })).status).toBe(400);

    // Quem tem filhos não vira subcategoria; ninguém é pai de si mesmo.
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'PATCH', token, body: { parentId: child.body.id } })).status).toBe(400);
    expect((await api(`/catalog/categories/${child.body.id}`, { method: 'PATCH', token, body: { parentId: child.body.id } })).status).toBe(400);

    const list = await api(`/catalog/categories?store=${store.slug}`);
    expect(list.body.find((c: { slug: string }) => c.slug === 'polo')).toMatchObject({ parentId: parent.body.id });

    // Produto na subcategoria aparece ao filtrar pela principal e pela própria subcategoria.
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', token, body: { categoryIds: [child.body.id] } });
    for (const slug of ['camisetas', 'polo']) expect((await api(`/catalog/products?store=${store.slug}&category=${slug}`)).body.total).toBe(1);
    expect((await api(`/catalog/products?store=${store.slug}&category=casa`)).body.total).toBe(0);

    // Excluir a principal sobe a subcategoria e mantém o produto na loja.
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'DELETE', token })).status).toBe(204);
    expect(await prisma.category.findUniqueOrThrow({ where: { id: child.body.id } })).toMatchObject({ parentId: null });
    expect((await api(`/catalog/products/vaso?store=${store.slug}`)).status).toBe(200);
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'DELETE', token })).status).toBe(404);
  });
});
