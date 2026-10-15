import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

const body = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  customer: { name: 'Ana Souza', email: 'Ana@Example.com', phone: '11999990000' },
  items, paymentMethod: 'PIX', ...extra,
});

describe('pedido manual pelo painel', () => {
  it('reserva estoque, aplica preço combinado, desconto e frete, e a confirmação baixa o estoque', async () => {
    const { store, product } = await createStore(5);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    const created = await api('/orders/manual', { method: 'POST', token, body: body([{ productId: product.id, quantity: 2, unitPrice: '40,00' }], { discount: '5', shipping: '12,50', shippingMethod: 'Motoboy', note: 'Pedido do WhatsApp' }) });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'AWAITING_PAYMENT', subtotal: '80', discount: '5', shipping: '12.5', total: '87.5', shippingMethod: 'Motoboy' });
    expect(created.body.payments[0]).toMatchObject({ provider: 'manual', method: 'PIX', status: 'PENDING', expiresAt: null });
    expect(created.body.customer).toMatchObject({ email: 'ana@example.com', phone: '11999990000' });
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 2 });

    const detail = await api(`/orders/${created.body.number}`, { token });
    const messages = detail.body.timeline.map((t: { message: string }) => t.message).join(' | ');
    expect(messages).toContain('Pedido manual criado no painel: Pedido do WhatsApp');
    expect(messages).toContain('Preço ajustado');
    expect(await prisma.outboxEvent.count({ where: { storeId: store.id, eventName: 'orders.order-created.v1' } })).toBe(1);

    await api(`/orders/${created.body.number}/confirm-payment`, { method: 'POST', token, body: {} });
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 3, reserved: 0 });
  });

  it('venda já paga entra como paga e baixa o estoque; o mesmo e-mail reaproveita o cliente', async () => {
    const { store, product } = await createStore(5);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    const paid = await api('/orders/manual', { method: 'POST', token, body: body([{ productId: product.id, quantity: 1 }], { paid: true, shippingAddress: { zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'sp' } }) });
    expect(paid.status).toBe(201);
    const order = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number: paid.body.number }, include: { payments: true } });
    expect(order.status).toBe('PAID');
    expect(order.payments[0].status).toBe('PAID');
    expect(order.shippingAddress).toMatchObject({ state: 'SP' });
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 4, reserved: 0 });
    await api('/orders/manual', { method: 'POST', token, body: body([{ productId: product.id, quantity: 1 }]) });
    expect(await prisma.customer.count({ where: { storeId: store.id, email: 'ana@example.com' } })).toBe(1);
  });

  it('recusa estoque insuficiente, linhas repetidas, desconto acima dos itens, documento inválido e produto em rascunho', async () => {
    const { store, product, draft } = await createStore(2);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    const post = (payload: unknown) => api('/orders/manual', { method: 'POST', token, body: payload });
    expect((await post(body([{ productId: product.id, quantity: 3 }]))).status).toBe(409);
    expect((await post(body([{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 1 }]))).status).toBe(400);
    expect((await post(body([{ productId: product.id, quantity: 1 }], { discount: '500' }))).status).toBe(400);
    expect((await post(body([{ productId: product.id, quantity: 1, unitPrice: '-1' }]))).status).toBe(400);
    expect((await post({ ...body([{ productId: product.id, quantity: 1 }]), customer: { name: 'A', email: 'a@b.com', document: '11111111111' } })).status).toBe(400);
    expect((await post(body([{ productId: draft.id, quantity: 1 }]))).status).toBe(400);
    expect(await inventoryOf(product.id)).toMatchObject({ reserved: 0 });
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('exige permissão de escrita em pedidos e isola por loja', async () => {
    const { store, product } = await createStore(2);
    const other = await createStore(2);
    const reader = await login(api, store, ['orders.read']);
    expect((await api('/orders/manual', { method: 'POST', token: reader, body: body([{ productId: product.id, quantity: 1 }]) })).status).toBe(403);
    const token = await login(api, store, ['orders.write']);
    expect((await api('/orders/manual', { method: 'POST', token, body: body([{ productId: other.product.id, quantity: 1 }]) })).status).toBe(400);
  });
});
