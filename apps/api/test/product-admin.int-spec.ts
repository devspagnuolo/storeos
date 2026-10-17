import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('lista gerencial de produtos', () => {
  it('conta por situação, exclui só quem nunca teve pedido e inativa o resto', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['catalog.write']);
    const spare = await prisma.product.create({ data: { storeId: store.id, name: 'Sem venda', slug: 'sem-venda', sku: 'SV-1', price: 10, status: 'ACTIVE', inventory: { create: { storeId: store.id, quantity: 3 } } } });
    await prisma.product.create({ data: { storeId: store.id, name: 'Antigo', slug: 'antigo', sku: 'AN-1', price: 10, status: 'ARCHIVED' } });

    // O produto vendido teve um pedido que depois foi cancelado: continua bloqueado para exclusão.
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    expect(order.status).toBe(201);
    await prisma.order.updateMany({ where: { storeId: store.id, number: order.body.number }, data: { status: 'CANCELLED' } });
    await prisma.inventory.updateMany({ where: { productId: product.id }, data: { reserved: 0 } });

    const list = await api('/catalog/admin/products?status=ACTIVE', { token: admin });
    expect(list.body.counts).toMatchObject({ ACTIVE: 2, ARCHIVED: 1, DRAFT: 1 });
    expect(list.body.items.find((p: { id: string }) => p.id === product.id)).toMatchObject({ canDelete: false, orderLines: 1 });
    expect(list.body.items.find((p: { id: string }) => p.id === spare.id)).toMatchObject({ canDelete: true, orderLines: 0 });

    expect((await api(`/catalog/products/${product.id}`, { method: 'DELETE', token: admin })).status).toBe(409);
    const bulk = await api('/catalog/products/bulk', { method: 'POST', token: admin, body: { ids: [product.id, spare.id], action: 'delete' } });
    expect(bulk.body).toEqual({ updated: 0, deleted: 1, blocked: [product.name] });
    expect(await prisma.product.findUnique({ where: { id: spare.id } })).toBeNull();

    const off = await api('/catalog/products/bulk', { method: 'POST', token: admin, body: { ids: [product.id], action: 'deactivate' } });
    expect(off.body.updated).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe('ARCHIVED');
    // Inativo some da vitrine.
    expect((await api(`/catalog/products?store=${store.slug}`)).body.items.map((p: { id: string }) => p.id)).not.toContain(product.id);
    expect((await api('/catalog/products/bulk', { method: 'POST', token: admin, body: { ids: [product.id], action: 'activate' } })).body.updated).toBe(1);
    expect((await api('/catalog/products/bulk', { method: 'POST', token: await login(api, store, ['orders.read']), body: { ids: [product.id], action: 'delete' } })).status).toBe(403);
  });
});
