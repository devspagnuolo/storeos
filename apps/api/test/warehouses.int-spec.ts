import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('multi-estoque', () => {
  it('cria depósitos, transfere, ajusta e mantém o total coerente com as vendas', async () => {
    const { store, product } = await createStore(10);
    const other = await createStore();
    const admin = await login(api, store, ['catalog.write', 'orders.read', 'orders.write']);

    const initial = await api('/inventory/warehouses', { token: admin });
    expect(initial.body).toHaveLength(1);
    expect(initial.body[0]).toMatchObject({ name: 'Principal', isDefault: true, units: 10 });
    const main = initial.body[0].id as string;

    const filial = await api('/inventory/warehouses', { method: 'POST', token: admin, body: { name: 'Filial Centro' } });
    expect(filial.status).toBe(201);
    expect((await api('/inventory/warehouses', { method: 'POST', token: admin, body: { name: 'filial centro' } })).status).toBe(409);

    // transferência
    const t = await api('/inventory/transfer', { method: 'POST', token: admin, body: { productId: product.id, fromId: main, toId: filial.body.id, quantity: 4, reason: 'Abastecer filial' } });
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ from: { quantity: 6 }, to: { quantity: 4 } });
    expect((await inventoryOf(product.id)).quantity).toBe(10);
    expect((await api('/inventory/transfer', { method: 'POST', token: admin, body: { productId: product.id, fromId: main, toId: filial.body.id, quantity: 7 } })).status).toBe(400);
    expect((await api('/inventory/transfer', { method: 'POST', token: admin, body: { productId: product.id, fromId: main, toId: main, quantity: 1 } })).status).toBe(400);

    // ajuste num depósito mexe no total
    const adj = await api('/inventory/adjust-warehouse', { method: 'POST', token: admin, body: { productId: product.id, warehouseId: filial.body.id, mode: 'DELTA', quantity: 3, reason: 'Entrada de mercadoria' } });
    expect(adj.body).toMatchObject({ quantity: 7, total: 13 });
    expect((await api('/inventory/adjust-warehouse', { method: 'POST', token: admin, body: { productId: product.id, warehouseId: filial.body.id, mode: 'DELTA', quantity: -8, reason: 'Perda' } })).status).toBe(400);

    // ajuste geral não pode ficar abaixo do que está nas filiais
    expect((await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'SET', quantity: 5, reason: 'Contagem' } })).status).toBe(400);

    // venda consome do total: o principal absorve a saída
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    expect(order.status).toBe(201);
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });

    const matrix = await api('/inventory/warehouses-stock', { token: admin });
    const row = matrix.body.items.find((i: { productId: string }) => i.productId === product.id);
    expect(row.byWarehouse[main]).toBe(row.quantity - 7); // vendas só mexem no total; o principal é o restante
    expect(row.byWarehouse[filial.body.id]).toBe(7);
    expect(Object.values(row.byWarehouse as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(row.quantity);

    // exclusão
    expect((await api(`/inventory/warehouses/${filial.body.id}`, { method: 'DELETE', token: admin })).status).toBe(400);
    expect((await api(`/inventory/warehouses/${main}`, { method: 'DELETE', token: admin })).status).toBe(400);
    expect((await api(`/inventory/warehouses/${main}`, { method: 'PATCH', token: admin, body: { active: false } })).status).toBe(400);
    expect((await api('/inventory/transfers', { token: admin })).body).toHaveLength(1);

    // isolamento e permissão
    const foreign = await login(api, other.store, ['catalog.write']);
    expect((await api(`/inventory/warehouses/${filial.body.id}`, { method: 'PATCH', token: foreign, body: { name: 'x1' } })).status).toBe(404);
    expect((await api('/inventory/warehouses', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
    expect(await prisma.warehouse.count({ where: { storeId: other.store.id } })).toBe(0);
  });
});
