import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

beforeAll(async () => {
  ({ app, api } = await startApp());
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(() => cleanup(app));

describe('razão de estoque', () => {
  it('registra vendas, devoluções e ajustes manuais com saldo e responsável', async () => {
    const { store, product } = await createStore(5);
    const admin = await login(api, store, ['catalog.write', 'orders.write', 'orders.read']);

    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });

    const adjusted = await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'DELTA', quantity: 10, reason: 'Compra do fornecedor' } });
    expect(adjusted.body).toMatchObject({ quantity: 13, reserved: 0, available: 13 });
    const counted = await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'SET', quantity: 12, reason: 'Contagem do inventário' } });
    expect(counted.body.quantity).toBe(12);

    const log = await api('/inventory/movements', { token: admin });
    expect(log.body.total).toBe(3);
    expect(log.body.items.map((m: { type: string; delta: number; balance: number }) => [m.type, m.delta, m.balance]).reverse()).toEqual([['SALE', -2, 3], ['ADJUSTMENT', 10, 13], ['ADJUSTMENT', -1, 12]]);
    expect(log.body.items[2]).toMatchObject({ orderNumber: order.body.number, sku: 'VASO-1', productName: 'Vaso azul' });
    expect(log.body.items[0].actorId).toBeTruthy();

    // Devolução com reposição registra a entrada.
    const post = (step: string, body: object = {}) => api(`/orders/${order.body.number}/${step}`, { method: 'POST', token: admin, body });
    await post('pick'); await post('invoice', { invoiceNumber: '1' }); await post('ship', { carrier: 'X', trackingCode: 'T1' }); await post('deliver');
    expect((await post('return', { reason: 'Não serviu' })).status).toBe(200);
    const returns = await api('/inventory/movements?type=RETURN', { token: admin });
    expect(returns.body.items).toMatchObject([{ delta: 2, balance: 14, reason: expect.stringContaining('Não serviu') }]);
  });

  it('não deixa o saldo abaixo do reservado e exige o motivo', async () => {
    const { store, product } = await createStore(5);
    const admin = await login(api, store, ['catalog.write']);
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 3 }], 'BOLETO') });
    const tooLow = await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'SET', quantity: 2, reason: 'Teste' } });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.message).toContain('reservadas');
    expect((await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'DELTA', quantity: -1 } })).status).toBe(400);
    expect((await prisma.inventory.findFirstOrThrow({ where: { productId: product.id } })).quantity).toBe(5);
  });

  it('exige escolher a variação, lista estoque baixo e exporta CSV', async () => {
    const { store, product } = await createStore(0);
    const other = await createStore(1);
    const admin = await login(api, store, ['catalog.write']);
    await api(`/catalog/products/${product.id}/variants`, { method: 'PUT', token: admin, body: { variants: [
      { sku: 'V-P', attributes: [{ name: 'Tamanho', value: 'P' }], stock: 2 },
      { sku: 'V-G', attributes: [{ name: 'Tamanho', value: 'G' }], stock: 40 },
    ] } });
    const [p] = (await api(`/catalog/admin/products/${product.id}`, { token: admin })).body.variants as { id: string }[];

    expect((await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, mode: 'DELTA', quantity: 1, reason: 'Sem variação' } })).status).toBe(400);
    expect((await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: other.product.id, mode: 'DELTA', quantity: 1, reason: 'Outra loja' } })).status).toBe(404);
    const ok = await api('/inventory/adjust', { method: 'POST', token: admin, body: { productId: product.id, variantId: p.id, mode: 'DELTA', quantity: 1, reason: 'Achei uma peça' } });
    expect(ok.body.quantity).toBe(3);

    const items = await api('/inventory/items', { token: admin });
    expect(items.body).toMatchObject([{ sku: 'V-P', variation: 'P', quantity: 3 }, { sku: 'V-G', variation: 'G', quantity: 40 }]);

    const low = await api('/inventory/low-stock?threshold=5', { token: admin });
    expect(low.body).toHaveLength(1);
    expect(low.body[0]).toMatchObject({ sku: 'V-P', available: 3 });

    const csv = await fetch(`${baseUrl}/api/v1/inventory/export.csv`, { headers: { authorization: `Bearer ${admin}` } });
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const text = await csv.text();
    expect(text).toContain('SKU;Produto;Variação;Status;Preço;Físico;Reservado;Disponível');
    expect(text).toContain('V-G;Vaso azul;G;ACTIVE;49.9;40;0;40');

    // Edição de variações também entra no razão.
    const log = await api(`/inventory/movements?productId=${product.id}`, { token: admin });
    expect(log.body.items.map((m: { type: string }) => m.type).sort()).toEqual(['ADJUSTMENT', 'INITIAL', 'INITIAL']);
  });

  it('só quem tem catalog.write acessa', async () => {
    const { store } = await createStore();
    const reader = await login(api, store, ['orders.read']);
    expect((await api('/inventory/movements', { token: reader })).status).toBe(403);
    expect((await api('/inventory/movements')).status).toBe(401);
  });
});
