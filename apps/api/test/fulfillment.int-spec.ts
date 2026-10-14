import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

async function paidOrder(stock = 5) {
  const { store, product } = await createStore(stock);
  const admin = await login(api, store, ['orders.read', 'orders.write', 'audit.read']);
  const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
  expect(checkout.status).toBe(201);
  const number = checkout.body.number as string;
  expect((await api(`/orders/${number}/confirm-payment`, { method: 'POST', token: admin, body: {} })).status).toBe(200);
  return { store, product, admin, number };
}

describe('fluxo logístico do pedido', () => {
  it('percorre separação, faturamento, expedição e entrega registrando dados e linha do tempo', async () => {
    const { admin, number } = await paidOrder();
    const post = (action: string, body: unknown = {}) => api(`/orders/${number}/${action}`, { method: 'POST', token: admin, body });

    // Fora de ordem é conflito.
    expect((await post('ship', { carrier: 'Correios', trackingCode: 'AA1' })).status).toBe(409);
    expect((await post('pick')).body.status).toBe('PICKING');
    expect((await post('pick')).status).toBe(200); // repetir é idempotente
    expect((await post('invoice', {})).status).toBe(400); // número da nota obrigatório
    expect((await post('invoice', { invoiceNumber: '1234', invoiceKey: '3'.repeat(44) })).body.status).toBe('INVOICED');
    const shipped = await post('ship', { carrier: 'Correios', trackingCode: 'BR123456789BR', trackingUrl: 'https://rastreio.example/BR123456789BR' });
    expect(shipped.body.status).toBe('SHIPPED');
    expect(shipped.body.fulfillment).toMatchObject({ invoiceNumber: '1234', carrier: 'Correios', trackingCode: 'BR123456789BR' });
    expect((await post('deliver')).body.status).toBe('DELIVERED');
    expect((await post('deliver')).status).toBe(200);

    const detail = await api(`/orders/${number}`, { token: admin });
    expect(detail.body.timeline.map((t: { status: string }) => t.status)).toEqual(['NEW', 'AWAITING_PAYMENT', 'PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED']);
    expect(detail.body.fulfillment.deliveredAt).toBeTruthy();
  });

  it('devolução repõe o estoque e só vale para pedido entregue', async () => {
    const { product, admin, number } = await paidOrder(5);
    const post = (action: string, body: unknown = {}) => api(`/orders/${number}/${action}`, { method: 'POST', token: admin, body });
    expect((await post('return', { reason: 'Defeito' })).status).toBe(409);
    await post('pick'); await post('invoice', { invoiceNumber: '9' }); await post('ship', { carrier: 'X', trackingCode: 'T1' }); await post('deliver');
    expect((await inventoryOf(product.id)).quantity).toBe(3);
    const result = await post('return', { reason: 'Defeito' });
    expect(result.body.status).toBe('RETURNED');
    expect(result.body.fulfillment.returnReason).toBe('Defeito');
    expect((await inventoryOf(product.id)).quantity).toBe(5);
    expect((await post('return', { reason: 'Defeito' })).status).toBe(200); // sem repor duas vezes
    expect((await inventoryOf(product.id)).quantity).toBe(5);
  });

  it('exige orders.write e não cruza lojas', async () => {
    const { number } = await paidOrder();
    const other = await createStore();
    const outsider = await login(api, other.store, ['orders.read', 'orders.write']);
    const reader = await login(api, other.store, ['orders.read']);
    expect((await api(`/orders/${number}/pick`, { method: 'POST', token: outsider, body: {} })).status).toBe(404);
    expect((await api(`/orders/${number}/pick`, { method: 'POST', token: reader, body: {} })).status).toBe(403);
    expect(await prisma.fulfillment.count({ where: { storeId: other.store.id } })).toBe(0);
  });
});
