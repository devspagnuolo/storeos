import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('categorias e subcategorias', () => {
  it('cria árvore de até quatro níveis, filtra pela categoria principal e preserva produtos ao excluir', async () => {
    const { store, product } = await createStore();
    const token = await login(api, store, ['catalog.write']);
    const parent = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Camisetas', slug: 'camisetas' } });
    const child = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Polo', slug: 'polo', parentId: parent.body.id } });
    expect(child.status).toBe(201);

    // Terceiro e quarto níveis valem; o quinto não, nem categoria pai de outra loja.
    const neta = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Neta', slug: 'neta', parentId: child.body.id } });
    const bisneta = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Bisneta', slug: 'bisneta', parentId: neta.body.id } });
    expect([neta.status, bisneta.status]).toEqual([201, 201]);
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'Quinta', slug: 'quinta', parentId: bisneta.body.id } })).status).toBe(400);
    const other = await createStore();
    const foreign = await prisma.category.findFirstOrThrow({ where: { storeId: other.store.id } });
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'Fora', slug: 'fora', parentId: foreign.id } })).status).toBe(400);

    // Ninguém vira filho de si mesmo nem de um descendente (ciclo).
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'PATCH', token, body: { parentId: child.body.id } })).status).toBe(400);
    expect((await api(`/catalog/categories/${child.body.id}`, { method: 'PATCH', token, body: { parentId: child.body.id } })).status).toBe(400);

    const list = await api(`/catalog/categories?store=${store.slug}`);
    expect(list.body.find((c: { slug: string }) => c.slug === 'polo')).toMatchObject({ parentId: parent.body.id });

    // Produto na subcategoria aparece ao filtrar pela principal e pela própria subcategoria.
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', token, body: { categoryIds: [child.body.id] } });
    for (const slug of ['camisetas', 'polo']) expect((await api(`/catalog/products?store=${store.slug}&category=${slug}`)).body.total).toBe(1);
    expect((await api(`/catalog/products?store=${store.slug}&category=casa`)).body.total).toBe(0);

    // Produto no quarto nível aparece em todos os ancestrais.
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', token, body: { categoryIds: [bisneta.body.id] } });
    for (const slug of ['camisetas', 'polo', 'neta', 'bisneta']) expect((await api(`/catalog/products?store=${store.slug}&category=${slug}`)).body.total).toBe(1);

    // Mesmo nome em outro pai (Alfaiataria em Conjuntos e em Social) ganha URL própria em vez de dar conflito.
    const social = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Social', slug: 'social' } });
    const a1 = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Alfaiataria', slug: 'alfaiataria', parentId: parent.body.id } });
    const a2 = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Alfaiataria', slug: 'alfaiataria', parentId: social.body.id } });
    expect([a1.body.slug, a2.body.slug]).toEqual(['alfaiataria', 'social-alfaiataria']);
    // A ordem de criação vira a ordem de exibição dentro do mesmo nível.
    const order = (await api(`/catalog/categories?store=${store.slug}`)).body.filter((c: { parentId: string | null }) => !c.parentId).map((c: { slug: string }) => c.slug);
    expect(order.indexOf('camisetas')).toBeLessThan(order.indexOf('social'));
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'Raiz repetida', slug: 'social' } })).status).toBe(409);

    // Mover leva a árvore junto: Polo carrega 3 níveis: não cabe dentro de Alfaiataria (nível 2), mas cabe direto em Social.
    expect((await api(`/catalog/categories/${child.body.id}`, { method: 'PATCH', token, body: { parentId: a2.body.id } })).status).toBe(400);
    expect((await api(`/catalog/categories/${child.body.id}`, { method: 'PATCH', token, body: { parentId: social.body.id } })).status).toBe(200);

    // Excluir a principal sobe a subcategoria (Alfaiataria vira principal) e mantém o produto na loja.
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'DELETE', token })).status).toBe(204);
    expect(await prisma.category.findUniqueOrThrow({ where: { id: a1.body.id } })).toMatchObject({ parentId: null });
    expect((await api(`/catalog/products/vaso?store=${store.slug}`)).status).toBe(200);
    // Excluir uma categoria do meio sobe os filhos para o pai dela.
    expect((await api(`/catalog/categories/${neta.body.id}`, { method: 'DELETE', token })).status).toBe(204);
    expect(await prisma.category.findUniqueOrThrow({ where: { id: bisneta.body.id } })).toMatchObject({ parentId: child.body.id });
    expect((await api(`/catalog/categories/${parent.body.id}`, { method: 'DELETE', token })).status).toBe(404);
  });
});
