import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('catálogo público', () => {
  it('lista apenas produtos ativos, filtra por categoria e busca', async () => {
    const { store } = await createStore();
    const all = await api(`/catalog/products?store=${store.slug}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].slug).toBe('vaso');
    expect((await api(`/catalog/products?store=${store.slug}&category=casa`)).body.total).toBe(1);
    expect((await api(`/catalog/products?store=${store.slug}&category=outra`)).body.total).toBe(0);
    expect((await api(`/catalog/products?store=${store.slug}&q=AZUL`)).body.total).toBe(1);
    expect((await api(`/catalog/categories?store=${store.slug}`)).body).toEqual([expect.objectContaining({ slug: 'casa', name: 'Casa' })]);
  });

  it('mostra o produto com saldo disponível e esconde rascunhos', async () => {
    const { store } = await createStore(3);
    const product = await api(`/catalog/products/vaso?store=${store.slug}`);
    expect(product.body).toMatchObject({ slug: 'vaso', available: 3, categories: [{ slug: 'casa', name: 'Casa' }] });
    expect((await api(`/catalog/products/rascunho?store=${store.slug}`)).status).toBe(404);
  });
});

describe('checkout', () => {
  it('cria pedido, cliente, cobrança e reserva o estoque', async () => {
    const { store, product } = await createStore(5);
    const result = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 1 }]) });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ status: 'AWAITING_PAYMENT', total: '99.80', items: [{ sku: 'VASO-1', quantity: 2, total: '99.80' }], payment: { method: 'PIX', status: 'PENDING' } });
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { productId: product.id } });
    expect(inventory.reserved).toBe(2);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'maria@example.com' } } });
    const order = await prisma.order.findFirstOrThrow({ where: { number: result.body.number }, include: { payments: true } });
    expect(order.customerId).toBe(customer.id);
    expect(order.payments[0]).toMatchObject({ provider: 'manual', status: 'PENDING' });
  });

  it('recusa quando não há estoque e não reserva nada', async () => {
    const { store, product } = await createStore(1);
    const result = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }]) });
    expect(result.status).toBe(409);
    expect((await prisma.inventory.findFirstOrThrow({ where: { productId: product.id } })).reserved).toBe(0);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('não vende acima do estoque com pedidos simultâneos', async () => {
    const { store, product } = await createStore(3);
    const results = await Promise.all(Array.from({ length: 6 }, () => api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) })));
    expect(results.filter(r => r.status === 201)).toHaveLength(3);
    expect((await prisma.inventory.findFirstOrThrow({ where: { productId: product.id } })).reserved).toBe(3);
  });

  it('recusa quantidade inválida, rascunho e produto de outra loja', async () => {
    const { store, draft } = await createStore();
    const other = await createStore();
    for (const items of [[{ productId: other.product.id, quantity: 1 }], [{ productId: draft.id, quantity: 1 }]]) {
      expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, items) })).status).toBe(400);
    }
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: other.product.id, quantity: -1 }]) })).status).toBe(400);
  });
});

describe('administração', () => {
  it('exige permissão catalog.write para criar produto', async () => {
    const { store } = await createStore();
    const product = { name: 'Novo', slug: 'novo', sku: 'NOVO-1', price: 10 };
    const viewer = await login(api, store, ['orders.read']);
    expect((await api('/catalog/products', { method: 'POST', body: product, token: viewer })).status).toBe(403);
    const editor = await login(api, store, ['catalog.write']);
    expect((await api('/catalog/products', { method: 'POST', body: product, token: editor })).status).toBe(201);
    expect((await api('/catalog/products', { method: 'POST', body: product, token: editor })).status).toBe(409);
  });

  it('não aceita pedido para cliente de outra loja', async () => {
    const { store, product } = await createStore();
    const other = await createStore();
    const foreignCustomer = await prisma.customer.create({ data: { storeId: other.store.id, email: 'x@example.com', name: 'X' } });
    const token = await login(api, store, ['orders.write']);
    const result = await api('/orders', { method: 'POST', token, body: { customerId: foreignCustomer.id, items: [{ productId: product.id, quantity: 1 }] } });
    expect(result.status).toBe(400);
  });
});

describe('saúde', () => {
  it('liveness e readiness respondem, e o readiness confirma o banco', async () => {
    expect((await api('/health')).status).toBe(200);
    const ready = await api('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
