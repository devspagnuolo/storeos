import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('marcas, coleções e SEO', () => {
  it('associa marca e SEO ao produto e filtra a vitrine por marca e coleção', async () => {
    const { store, product } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['catalog.write']);

    const brand = await api('/catalog/brands', { method: 'POST', token: admin, body: { name: 'Casa Azul', slug: 'casa-azul' } });
    expect(brand.status).toBe(201);
    expect((await api('/catalog/brands', { method: 'POST', token: admin, body: { name: 'Outra', slug: 'casa-azul' } })).status).toBe(409);

    const updated = await api(`/catalog/products/${product.id}`, { method: 'PATCH', token: admin, body: { brandId: brand.body.id, seoTitle: 'Vaso azul artesanal', seoDescription: 'Feito à mão' } });
    expect(updated.status).toBe(200);
    // Marca de outra loja é recusada.
    const foreign = await api('/catalog/brands', { method: 'POST', token: await login(api, other.store, ['catalog.write']), body: { name: 'Alheia', slug: 'alheia' } });
    expect((await api(`/catalog/products/${product.id}`, { method: 'PATCH', token: admin, body: { brandId: foreign.body.id } })).status).toBe(400);

    const detail = await api(`/catalog/products/vaso?store=${store.slug}`);
    expect(detail.body).toMatchObject({ seoTitle: 'Vaso azul artesanal', brand: { slug: 'casa-azul' } });
    expect((await api(`/catalog/products?store=${store.slug}&brand=casa-azul`)).body.total).toBe(1);
    expect((await api(`/catalog/products?store=${store.slug}&brand=nenhuma`)).body.total).toBe(0);

    expect((await api('/catalog/collections', { method: 'POST', token: admin, body: { name: 'Verão', slug: 'verao', skus: ['NAO-EXISTE'] } })).status).toBe(400);
    const collection = await api('/catalog/collections', { method: 'POST', token: admin, body: { name: 'Verão', slug: 'verao', skus: ['VASO-1'] } });
    expect(collection.status).toBe(201);
    expect((await api(`/catalog/products?store=${store.slug}&collection=verao`)).body.total).toBe(1);
    expect((await api('/catalog/admin/collections', { token: admin })).body[0].skus).toEqual(['VASO-1']);

    await api(`/catalog/collections/${collection.body.id}`, { method: 'PATCH', token: admin, body: { skus: [] } });
    expect((await api(`/catalog/products?store=${store.slug}&collection=verao`)).body.total).toBe(0);
    await api(`/catalog/collections/${collection.body.id}`, { method: 'PATCH', token: admin, body: { skus: ['VASO-1'], active: false } });
    expect((await api(`/catalog/products?store=${store.slug}&collection=verao`)).body.total).toBe(0);
    expect((await api(`/catalog/collections?store=${store.slug}`)).body).toEqual([]);

    // Outra loja não edita a coleção.
    const outsider = await login(api, other.store, ['catalog.write']);
    expect((await api(`/catalog/collections/${collection.body.id}`, { method: 'PATCH', token: outsider, body: { name: 'Invasor' } })).status).toBe(404);
  });
});
