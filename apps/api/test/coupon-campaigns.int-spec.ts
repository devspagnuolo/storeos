import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('campanhas de cupom', () => {
  it('vale só para a categoria escolhida e recusa quando o carrinho não tem item elegível', async () => {
    const { store, product, draft } = await createStore(10);
    const category = await prisma.category.findFirstOrThrow({ where: { storeId: store.id } });
    const other = await prisma.product.create({ data: { storeId: store.id, slug: 'xicara', sku: 'XIC-1', name: 'Xícara', price: '20.00', status: 'ACTIVE' } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: other.id, quantity: 10 } });
    const admin = await login(api, store, ['marketing.write']);

    const created = await api('/coupons', { method: 'POST', token: admin, body: { code: 'CASA20', type: 'PERCENT', value: 20, categoryIds: [category.id] } });
    expect(created.status).toBe(201);
    // Categoria de outra loja é recusada.
    const foreign = await createStore();
    const fc = await prisma.category.findFirstOrThrow({ where: { storeId: foreign.store.id } });
    expect((await api('/coupons', { method: 'POST', token: admin, body: { code: 'X1', type: 'PERCENT', value: 5, categoryIds: [fc.id] } })).status).toBe(400);
    void draft;

    const mixed = [{ productId: product.id, quantity: 1 }, { productId: other.id, quantity: 1 }];
    const preview = await api('/coupons/preview', { method: 'POST', body: { storeSlug: store.slug, code: 'CASA20', items: mixed } });
    expect(preview.body.discount).toBe('9.98'); // 20% de 49,90, e a xícara fica de fora
    const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, mixed, 'BOLETO'), couponCode: 'CASA20' } });
    expect(order.body).toMatchObject({ subtotal: '69.90', discount: '9.98', total: '59.92' });

    const onlyOther = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: other.id, quantity: 1 }], 'BOLETO'), couponCode: 'CASA20' } });
    expect(onlyOther.status).toBe(400);
    expect(onlyOther.body.message).toContain('não vale para os produtos');
  });

  it('cupom de primeira compra recusa quem já comprou', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['marketing.write']);
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'PRIMEIRA', type: 'PERCENT', value: 10, firstOrderOnly: true } });
    const items = [{ productId: product.id, quantity: 1 }];
    const first = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'PRIMEIRA' } });
    expect(first.status).toBe(201);
    const second = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: 'PRIMEIRA' } });
    expect(second.status).toBe(400);
    expect(second.body.message).toContain('primeira compra');
  });

  it('gera códigos únicos em lote, de uso único, e mostra o desempenho da campanha', async () => {
    const { store, product } = await createStore(20);
    const admin = await login(api, store, ['marketing.write']);
    const bulk = await api('/coupons/bulk', { method: 'POST', token: admin, body: { prefix: 'vip', count: 5, campaign: 'Black VIP', type: 'FIXED', value: 10 } });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toBe(5);
    expect(new Set(bulk.body.codes).size).toBe(5);
    expect(bulk.body.codes[0]).toMatch(/^VIP-[A-Z2-9]{6}$/);

    // Não aparecem na lista de avulsos; aparecem agrupados.
    expect((await api('/coupons', { token: admin })).body).toHaveLength(0);
    const code = bulk.body.codes[0] as string;
    const items = [{ productId: product.id, quantity: 1 }];
    const used = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: code } });
    expect(used.status).toBe(201);
    expect((await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: code } })).status).toBe(400);

    const campaigns = await api('/coupons/campaigns', { token: admin });
    expect(campaigns.body).toHaveLength(1);
    expect(campaigns.body[0]).toMatchObject({ name: 'Black VIP', total: 5, used: 1, discount: '10.00', paidOrders: 0 });
    const codes = await api(`/coupons/campaigns/${encodeURIComponent('Black VIP')}`, { token: admin });
    expect(codes.body).toHaveLength(5);
    expect(codes.body.filter((c: { used: boolean }) => c.used)).toHaveLength(1);

    await api(`/coupons/campaigns/${encodeURIComponent('Black VIP')}`, { method: 'PATCH', token: admin, body: { active: false } });
    const blocked = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), couponCode: bulk.body.codes[1] } });
    expect(blocked.status).toBe(400);
    expect((await api('/coupons/bulk', { method: 'POST', token: admin, body: { prefix: 'x', count: 5, campaign: 'A', type: 'FIXED', value: 1 } })).status).toBe(400);
  });

  it('cupom avulso mostra usos, receita e desconto', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['marketing.write']);
    await api('/coupons', { method: 'POST', token: admin, body: { code: 'DEZ', type: 'FIXED', value: 10 } });
    const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), couponCode: 'DEZ' } });
    await prisma.order.update({ where: { storeId_number: { storeId: store.id, number: order.body.number } }, data: { status: 'PAID' } });
    const list = await api('/coupons', { token: admin });
    expect(list.body[0].stats).toEqual({ uses: 1, paidOrders: 1, revenue: '39.90', discount: '10.00' });
  });
});
