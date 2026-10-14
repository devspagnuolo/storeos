import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('cupons', () => {
  it('aplica desconto no checkout, valida no servidor e devolve o uso ao cancelar', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['marketing.write', 'orders.write', 'orders.read']);
    const created = await api('/coupons', { method: 'POST', token: admin, body: { code: 'ola10', type: 'PERCENT', value: 10, maxUses: 1 } });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('OLA10');
    expect((await api('/coupons', { method: 'POST', token: admin, body: { code: 'OLA10', type: 'PERCENT', value: 5 } })).status).toBe(409);

    const items = [{ productId: product.id, quantity: 2 }];
    const preview = await api('/coupons/preview', { method: 'POST', body: { storeSlug: store.slug, code: 'ola10', items } });
    expect(preview.body).toMatchObject({ code: 'OLA10', discount: '9.98' });

    const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'ola10' } });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ subtotal: '99.80', discount: '9.98', total: '89.82', couponCode: 'OLA10' });

    // Limite de 1 uso: o segundo pedido é recusado e não segura estoque.
    const second = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'OLA10' } });
    expect(second.status).toBe(400);
    expect(second.body.message).toContain('esgotado');

    // Cancelar devolve o uso.
    await api(`/orders/${order.body.number}/cancel`, { method: 'POST', token: admin, body: {} });
    expect((await prisma.coupon.findFirstOrThrow({ where: { storeId: store.id } })).usedCount).toBe(0);
    const again = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'OLA10' } });
    expect(again.status).toBe(201);
  });

  it('cupom inválido, por cliente e frete grátis; só quem tem marketing.write administra', async () => {
    const { store, product } = await createStore(10);
    const other = await createStore();
    const admin = await login(api, store, ['marketing.write']);
    const reader = await login(api, store, ['orders.read']);
    expect((await api('/coupons', { token: reader })).status).toBe(403);
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'UMA', type: 'FIXED', value: 20, oncePerCustomer: true } });
    await api('/shipping/rules', { method: 'POST', token: await login(api, store, ['settings.write']), body: { name: 'Normal', price: 15, minDays: 2, maxDays: 5 } });
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'FRETE', type: 'FREE_SHIPPING' } });
    const items = [{ productId: product.id, quantity: 1 }];
    const rule = (await api(`/shipping/quote`, { method: 'POST', body: { storeSlug: store.slug, zipCode: '01310-100', items } })).body.options[0];

    const bad = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: rule.id, couponCode: 'NAOEXISTE' } });
    expect(bad.status).toBe(400);
    const fixed = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: rule.id, couponCode: 'UMA' } });
    expect(fixed.body).toMatchObject({ discount: '20.00', total: '44.90' });
    expect((await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: rule.id, couponCode: 'UMA' } })).status).toBe(400);
    const free = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: rule.id, couponCode: 'FRETE' } });
    expect(free.body).toMatchObject({ shipping: '15.00', discount: '15.00', total: '49.90' });

    // Cupom de outra loja não vale aqui.
    await api('/coupons', { method: 'POST', token: await login(api, other.store, ['marketing.write']), body: { code: 'OUTRA', type: 'PERCENT', value: 50 } });
    expect((await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: rule.id, couponCode: 'OUTRA' } })).status).toBe(400);
  });
});
