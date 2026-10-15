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

describe('regras de fidelidade da loja', () => {
  it('personaliza pontos, nível e resgate mínimo, e volta ao padrão', async () => {
    const { store, product } = await createStore(20);
    const admin = await login(api, store, ['orders.read', 'orders.write', 'marketing.write']);
    const reader = await login(api, store, ['orders.read']);
    expect((await api('/loyalty/config', { token: reader })).status).toBe(403);
    expect((await api('/loyalty/config', { token: admin })).body).toMatchObject({ customized: false, pointsPerReal: 1, realPerPoint: 0.05 });

    const rules = { enabled: true, pointsPerReal: 2, realPerPoint: 0.1, minRedeem: 100, silverFrom: 100, goldFrom: 2000, diamondFrom: 5000, silverPct: 150, goldPct: 150, diamondPct: 200 };
    expect((await api('/loyalty/config', { method: 'PUT', token: admin, body: { ...rules, goldFrom: 50 } })).status).toBe(400);
    expect((await api('/loyalty/config', { method: 'PUT', token: admin, body: rules })).body).toMatchObject({ customized: true, pointsPerReal: 2 });

    const pay = async () => {
      const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
      await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    };
    const customerId = async () => (await api('/customers', { token: admin })).body.items[0].id;
    await pay(); // 99,80 x 2 pts = 199 no nível Bronze (sem bônus)
    const id = await customerId();
    const first = await api(`/loyalty/customers/${id}`, { token: admin });
    expect(first.body).toMatchObject({ balance: 199, tier: { key: 'SILVER', pct: 150 }, valuePerPoint: 0.1, minRedeem: 100 });
    await pay(); // já é Prata: 199,6 x 1,5 = 299
    expect((await api(`/loyalty/customers/${id}`, { token: admin })).body.balance).toBe(199 + 299);

    expect((await api(`/loyalty/customers/${id}/redeem`, { method: 'POST', token: admin, body: { points: 50 } })).status).toBe(400);
    expect((await api(`/loyalty/customers/${id}/redeem`, { method: 'POST', token: admin, body: { points: 100 } })).body).toMatchObject({ value: '10.00', balance: 398 });

    await api('/loyalty/config', { method: 'PUT', token: admin, body: { ...rules, enabled: false } });
    await pay();
    expect((await api(`/loyalty/customers/${id}`, { token: admin })).body.balance).toBe(398);

    expect((await api('/loyalty/config', { method: 'DELETE', token: admin })).body).toMatchObject({ customized: false, pointsPerReal: 1 });
  });
});
