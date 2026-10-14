import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('analytics de vendas', () => {
  it('consolida receita, funil, produtos e cupons do período e isola por loja', async () => {
    const { store, product } = await createStore(30);
    const other = await createStore();
    const admin = await login(api, store, ['orders.read', 'orders.write', 'marketing.write']);
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'PROMO', type: 'FIXED', value: 10 } });
    const buy = async (quantity: number, pay: boolean, coupon?: string) => {
      const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity }], 'BOLETO'), couponCode: coupon } });
      if (pay) await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
      return order.body.number as string;
    };
    await buy(2, true, 'PROMO'); // 99.80 - 10 = 89.80
    const second = await buy(1, true); // 49.90
    await buy(1, false); // pendente: não entra na receita
    await api(`/orders/${second}/pick`, { method: 'POST', token: admin, body: {} });

    const report = await api('/analytics/sales', { token: admin });
    expect(report.status).toBe(200);
    expect(report.body.totals).toMatchObject({ revenue: '139.70', orders: 2, averageTicket: '69.85', discount: '10.00', buyers: 1 });
    expect(report.body.series).toHaveLength(30);
    expect(report.body.series.at(-1)).toMatchObject({ revenue: '139.70', orders: 2 });
    expect(report.body.topProducts[0]).toMatchObject({ sku: 'VASO-1', quantity: 3 });
    expect(report.body.funnel).toEqual([{ stage: 'Pedidos criados', count: 3 }, { stage: 'Pagos', count: 2 }, { stage: 'Enviados', count: 0 }, { stage: 'Entregues', count: 0 }]);
    expect(report.body.coupons).toEqual([{ code: 'PROMO', uses: 1, discount: '10.00' }]);

    expect((await api('/analytics/sales?from=2026-10-10&to=2026-10-01', { token: admin })).status).toBe(400);
    expect((await api('/analytics/sales?from=abc', { token: admin })).status).toBe(400);
    expect((await api('/analytics/sales', { token: await login(api, store, ['audit.read']) })).status).toBe(403);
    const foreign = await api('/analytics/sales', { token: await login(api, other.store, ['orders.read']) });
    expect(foreign.body.totals).toMatchObject({ revenue: '0.00', orders: 0 });
  });
});
