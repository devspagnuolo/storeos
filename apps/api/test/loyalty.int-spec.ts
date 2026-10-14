import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('fidelidade', () => {
  it('credita pontos ao pagar, estorna na devolução, ajusta, resgata em cupom e respeita permissões', async () => {
    const { store, product } = await createStore(20);
    const other = await createStore();
    const admin = await login(api, store, ['orders.read', 'orders.write', 'marketing.write']);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    const customerId = (await api('/customers', { token: admin })).body.items[0].id;
    const summary = () => api(`/loyalty/customers/${customerId}`, { token: admin });

    expect((await summary()).body).toMatchObject({ balance: 0, tier: { key: 'BRONZE' } });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} }); // repetido: sem pontos em dobro
    expect((await summary()).body).toMatchObject({ balance: 99, lifetime: 99, entries: [{ type: 'EARN', points: 99 }] });

    expect((await api(`/loyalty/customers/${customerId}/adjust`, { method: 'POST', token: admin, body: { points: 450, note: 'Bônus de boas-vindas' } })).status).toBe(200);
    expect((await api(`/loyalty/customers/${customerId}/adjust`, { method: 'POST', token: admin, body: { points: -9999, note: 'Teste' } })).status).toBe(400);

    const redeemed = await api(`/loyalty/customers/${customerId}/redeem`, { method: 'POST', token: admin, body: { points: 200 } });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body).toMatchObject({ value: '10.00', balance: 349 });
    expect((await api(`/loyalty/customers/${customerId}/redeem`, { method: 'POST', token: admin, body: { points: 5000 } })).status).toBe(400);
    // O cupom gerado funciona no checkout uma única vez.
    const used = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), couponCode: redeemed.body.code } });
    expect(used.body).toMatchObject({ discount: '10.00', total: '39.90' });
    expect((await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), couponCode: redeemed.body.code } })).status).toBe(400);

    // Devolução estorna os 99 pontos do pedido.
    const steps: [string, object][] = [['pick', {}], ['invoice', { invoiceNumber: '1' }], ['ship', { carrier: 'X', trackingCode: 'T' }], ['deliver', {}]];
    for (const [step, body] of steps) expect((await api(`/orders/${order.body.number}/${step}`, { method: 'POST', token: admin, body })).status).toBe(200);
    await api(`/orders/${order.body.number}/return`, { method: 'POST', token: admin, body: { reason: 'Defeito' } });
    const after = await summary();
    expect(after.body.balance).toBe(250);
    expect(after.body.lifetime).toBe(0); // ajuste manual não sobe de nível

    const outsider = await login(api, other.store, ['orders.read', 'marketing.write']);
    expect((await api(`/loyalty/customers/${customerId}`, { token: outsider })).status).toBe(404);
    expect((await api(`/loyalty/customers/${customerId}/adjust`, { method: 'POST', token: await login(api, store, ['orders.read']), body: { points: 1, note: 'abc' } })).status).toBe(403);
  });
});
