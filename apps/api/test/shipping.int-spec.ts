import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

async function storeWithRules() {
  const created = await createStore(10);
  const token = await login(api, created.store, ['settings.write']);
  const sudeste = await api('/shipping/rules', { method: 'POST', token, body: { name: 'Sudeste expresso', states: ['SP', 'RJ', 'MG', 'ES'], price: 15, freeAbove: 99.8, minDays: 1, maxDays: 3, position: 0 } });
  const brasil = await api('/shipping/rules', { method: 'POST', token, body: { name: 'Brasil econômico', price: 29.9, minDays: 5, maxDays: 12, position: 1 } });
  expect(sudeste.status).toBe(201);
  return { ...created, token, sudeste: sudeste.body, brasil: brasil.body };
}

describe('cotação de frete', () => {
  it('lista as opções da UF do CEP com frete grátis acima do valor', async () => {
    const { store, product, sudeste, brasil } = await storeWithRules();
    const one = await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '01310-100', items: [{ productId: product.id, quantity: 1 }] } });
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ state: 'SP', subtotal: '49.90', required: true, options: [{ id: sudeste.id, price: '15.00', free: false }, { id: brasil.id, price: '29.90' }] });
    const two = await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '01310100', items: [{ productId: product.id, quantity: 2 }] } });
    expect(two.body.options[0]).toMatchObject({ price: '0.00', free: true });
    const north = await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '69005-000', items: [{ productId: product.id, quantity: 1 }] } });
    expect(north.body).toMatchObject({ state: 'AM', options: [{ id: brasil.id }] });
  });

  it('recusa CEP inexistente e informa quando a loja não cobra frete', async () => {
    const { store, product } = await createStore();
    expect((await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '00000-000', items: [{ productId: product.id, quantity: 1 }] } })).status).toBe(400);
    const none = await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '01310-100', items: [{ productId: product.id, quantity: 1 }] } });
    expect(none.body).toMatchObject({ required: false, options: [] });
  });
});

describe('checkout com frete', () => {
  it('recalcula o frete no servidor e soma ao total e à cobrança', async () => {
    const { store, product, brasil } = await storeWithRules();
    const result = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]), shippingRuleId: brasil.id } });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ subtotal: '49.90', shipping: '29.90', total: '79.80', shippingMethod: 'Brasil econômico' });
    const order = await prisma.order.findFirstOrThrow({ where: { number: result.body.number }, include: { payments: true } });
    expect(order.payments[0].amount.toFixed(2)).toBe('79.80');
  });

  it('exige uma opção válida quando a loja tem regras e confere CEP x UF', async () => {
    const { store, product, sudeste } = await storeWithRules();
    const base = checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]);
    expect((await api('/checkout', { method: 'POST', body: base })).status).toBe(400);
    expect((await api('/checkout', { method: 'POST', body: { ...base, shippingRuleId: 'outra' } })).status).toBe(400);
    const wrongState = { ...base, shippingRuleId: sudeste.id, shippingAddress: { ...base.shippingAddress, state: 'RS' } };
    expect((await api('/checkout', { method: 'POST', body: wrongState })).status).toBe(400);
    const amazonas = { ...base, shippingRuleId: sudeste.id, shippingAddress: { ...base.shippingAddress, zipCode: '69005-000', state: 'AM' } };
    expect((await api('/checkout', { method: 'POST', body: amazonas })).status).toBe(400);
    expect((await prisma.inventory.findFirstOrThrow({ where: { productId: product.id } })).reserved).toBe(0);
  });
});

describe('regras de frete no painel', () => {
  it('exige settings.write e isola por loja', async () => {
    const { sudeste, token } = await storeWithRules();
    const other = await createStore();
    const otherToken = await login(api, other.store, ['settings.write']);
    const viewer = await login(api, other.store, ['orders.read']);
    expect((await api('/shipping/rules', { token: viewer })).status).toBe(403);
    expect((await api('/shipping/rules', { token: otherToken })).body).toEqual([]);
    expect((await api(`/shipping/rules/${sudeste.id}`, { method: 'PATCH', token: otherToken, body: { price: 1 } })).status).toBe(404);
    const updated = await api(`/shipping/rules/${sudeste.id}`, { method: 'PATCH', token, body: { freeAbove: null, active: false } });
    expect(updated.body).toMatchObject({ freeAbove: null, active: false });
    expect((await api(`/shipping/rules/${sudeste.id}`, { method: 'PATCH', token, body: { minDays: 9 } })).status).toBe(400);
    expect((await api(`/shipping/rules/${sudeste.id}`, { method: 'DELETE', token })).status).toBe(204);
  });
});
