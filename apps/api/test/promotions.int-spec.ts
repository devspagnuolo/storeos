import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('promoções automáticas', () => {
  it('aplica "leve 3 pague 2" no checkout, combina com cupom e respeita pausa e permissão', async () => {
    const { store, product } = await createStore(20);
    const admin = await login(api, store, ['marketing.write']);
    const created = await api('/promotions', { method: 'POST', token: admin, body: { name: 'Leve 3 pague 2', type: 'BUY_X_PAY_Y', buyQty: 3, payQty: 2, skus: ['VASO-1'] } });
    expect(created.status).toBe(201);

    // Regras inválidas são recusadas; sem permissão não há acesso.
    expect((await api('/promotions', { method: 'POST', token: admin, body: { name: 'Ruim', type: 'BUY_X_PAY_Y', buyQty: 2, payQty: 2 } })).status).toBe(400);
    expect((await api('/promotions', { method: 'POST', token: admin, body: { name: 'Zero', type: 'PERCENT_OFF', value: 0 } })).status).toBe(400);
    expect((await api('/promotions')).status).toBe(401);

    const items = [{ productId: product.id, quantity: 3 }];
    const preview = await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items } });
    expect(preview.body).toMatchObject({ subtotal: '149.70', discount: '49.90', total: '99.80', applied: [{ name: 'Leve 3 pague 2', amount: '49.90' }] });

    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, items, 'BOLETO') });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ subtotal: '149.70', promotionDiscount: '49.90', discount: '0.00', total: '99.80' });
    expect(await prisma.order.findFirstOrThrow({ where: { number: order.body.number } })).toMatchObject({ promotions: [{ name: 'Leve 3 pague 2', amount: '49.90' }] });

    // O cupom incide sobre o valor já com a promoção: 10% de 99,80.
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'MAIS10', type: 'PERCENT', value: 10 } });
    const withCoupon = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'MAIS10' } });
    expect(withCoupon.body).toMatchObject({ promotionDiscount: '49.90', discount: '9.98', total: '89.82' });
    const couponPreview = await api('/coupons/preview', { method: 'POST', body: { storeSlug: store.slug, code: 'MAIS10', items } });
    expect(couponPreview.body).toMatchObject({ discount: '9.98' });

    // Pausada, a promoção deixa de valer; a editada passa a valer na hora.
    const paused = await api(`/promotions/${created.body.id}`, { method: 'PATCH', token: admin, body: { active: false } });
    expect(paused.status).toBe(200);
    expect((await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items } })).body.discount).toBe('0.00');
    await api(`/promotions/${created.body.id}`, { method: 'PATCH', token: admin, body: { active: true, buyQty: 2, payQty: 1 } });
    expect((await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items } })).body.discount).toBe('49.90');
  });

  it('desconto de carrinho com pedido mínimo e isolamento entre lojas', async () => {
    const { store, product } = await createStore(20);
    const other = await createStore();
    const admin = await login(api, store, ['marketing.write']);
    const otherAdmin = await login(api, other.store, ['marketing.write']);
    const promo = await api('/promotions', { method: 'POST', token: admin, body: { name: '5% acima de 100', type: 'CART_PERCENT', value: 5, minSubtotal: 100 } });

    expect((await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items: [{ productId: product.id, quantity: 1 }] } })).body.discount).toBe('0.00');
    expect((await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items: [{ productId: product.id, quantity: 3 }] } })).body.discount).toBe('7.49');

    // A outra loja não vê nem altera, e a promoção não vaza para os pedidos dela.
    expect((await api('/promotions', { token: otherAdmin })).body).toEqual([]);
    expect((await api(`/promotions/${promo.body.id}`, { method: 'PATCH', token: otherAdmin, body: { active: false } })).status).toBe(404);
    expect((await api(`/promotions/${promo.body.id}`, { method: 'DELETE', token: otherAdmin })).status).toBe(404);
    expect((await api('/promotions/preview', { method: 'POST', body: { storeSlug: other.store.slug, items: [{ productId: other.product.id, quantity: 3 }] } })).body.discount).toBe('0.00');

    expect((await api(`/promotions/${promo.body.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api('/promotions', { token: admin })).body).toEqual([]);
  });
});
