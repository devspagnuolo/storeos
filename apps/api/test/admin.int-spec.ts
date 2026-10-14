import { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('sessão do painel', () => {
  it('renova o token com rotação e revoga tudo se um refresh antigo for reutilizado', async () => {
    const { store } = await createStore();
    const email = `dono-${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({ data: { storeId: store.id, email, name: 'Dona', passwordHash: await argon2.hash('senha-forte-123') } });
    const first = await api('/auth/login', { method: 'POST', body: { email: email.toUpperCase(), password: 'senha-forte-123', storeSlug: store.slug } });
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ email, store: { slug: store.slug } });

    const second = await api('/auth/refresh', { method: 'POST', body: { refreshToken: first.body.refreshToken } });
    expect(second.status).toBe(200);
    expect(second.body.refreshToken).not.toBe(first.body.refreshToken);

    // Duas abas renovando juntas: o mesmo token dentro da janela curta ainda vale.
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: first.body.refreshToken } })).status).toBe(200);
    await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: first.body.refreshToken } })).status).toBe(401);
    // Reuso fora da janela indica vazamento: a sessão nova também deixa de valer.
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: second.body.refreshToken } })).status).toBe(401);
  });

  it('logout invalida o refresh token', async () => {
    const { store } = await createStore();
    const email = `dono-${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({ data: { storeId: store.id, email, name: 'Dono', passwordHash: await argon2.hash('senha-forte-123') } });
    const session = await api('/auth/login', { method: 'POST', body: { email, password: 'senha-forte-123', storeSlug: store.slug } });
    await api('/auth/logout', { method: 'POST', body: { refreshToken: session.body.refreshToken } }).catch(() => undefined);
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: session.body.refreshToken } })).status).toBe(401);
  });
});

describe('gestão de produtos', () => {
  it('cria produto publicado com estoque e imagem, edita e lista', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['catalog.write']);
    const category = await prisma.category.findFirstOrThrow({ where: { storeId: store.id } });
    const created = await api('/catalog/products', { method: 'POST', token, body: { name: 'Caneca', slug: 'caneca', sku: 'CAN-1', price: 39.9, status: 'ACTIVE', stock: 12, imageUrl: 'https://cdn.example.com/caneca.jpg', categoryIds: [category.id] } });
    expect(created.status).toBe(201);
    expect((await api(`/catalog/products/caneca?store=${store.slug}`)).body).toMatchObject({ available: 12, images: [{ url: 'https://cdn.example.com/caneca.jpg' }] });

    const updated = await api(`/catalog/products/${created.body.id}`, { method: 'PATCH', token, body: { price: 44.9, stock: 20, status: 'ARCHIVED', imageUrl: '' } });
    expect(updated.status).toBe(200);
    const detail = await api(`/catalog/admin/products/${created.body.id}`, { token });
    expect(detail.body).toMatchObject({ price: '44.9', stock: 20, status: 'ARCHIVED', images: [], categoryIds: [category.id] });
    expect((await api(`/catalog/products/caneca?store=${store.slug}`)).status).toBe(404);

    const list = await api('/catalog/admin/products?q=can', { token });
    expect(list.body).toMatchObject({ total: 1, items: [{ sku: 'CAN-1', stock: 20 }] });
  });

  it('não deixa o estoque ficar abaixo do que está reservado', async () => {
    const { store, product } = await createStore(5);
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 3 }]) });
    const token = await login(api, store, ['catalog.write']);
    expect((await api(`/catalog/products/${product.id}`, { method: 'PATCH', token, body: { stock: 2 } })).status).toBe(400);
    expect((await api(`/catalog/products/${product.id}`, { method: 'PATCH', token, body: { stock: 8 } })).status).toBe(200);
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 8, reserved: 3 });
  });

  it('não edita produto de outra loja', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const token = await login(api, store, ['catalog.write']);
    expect((await api(`/catalog/products/${other.product.id}`, { method: 'PATCH', token, body: { price: 1 } })).status).toBe(404);
  });
});

describe('indicadores', () => {
  it('soma receita só de pedidos pagos', async () => {
    const { store, product } = await createStore(10);
    const token = await login(api, store, ['orders.read', 'orders.write']);
    const paid = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${paid.body.number}/confirm-payment`, { method: 'POST', token, body: {} });
    const summary = await api('/orders/summary', { token });
    expect(summary.body).toMatchObject({ revenue: '99.80', paidOrders: 1, averageTicket: '99.80', orders: 2, awaitingPayment: 1, paymentRate: 50 });
  });
});
