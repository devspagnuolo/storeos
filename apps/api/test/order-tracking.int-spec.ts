import { NestExpressApplication } from '@nestjs/platform-express';
import { resolveJwtSecret } from '../src/shared/auth/jwt-secret';
import { encryptSecret } from '../src/shared/auth/totp';
import { BlingClient } from '../src/modules/bling/bling.client';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

const remote: Record<string, unknown> = {};
const fakeBling = {
  appConfigured: true,
  async request(_token: string, path: string) {
    const id = path.split('/').pop()!;
    if (!(id in remote)) throw new Error(`pedido ${id} inesperado`);
    return { data: remote[id] };
  },
};

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => ({ app, api } = await startApp(b => b.overrideProvider(BlingClient).useValue(fakeBling))));
afterAll(() => cleanup(app));

const paidOrder = async (storeSlug: string, store: { id: string }, productId: string, token: string) => {
  const created = await api('/checkout', { method: 'POST', body: checkoutBody(storeSlug, [{ productId, quantity: 1 }], 'BOLETO') });
  const number = created.body.number as string;
  await api(`/orders/${number}/confirm-payment`, { method: 'POST', token, body: {} });
  await api(`/orders/${number}/pick`, { method: 'POST', token });
  await api(`/orders/${number}/invoice`, { method: 'POST', token, body: { invoiceNumber: '123' } });
  return number;
};

describe('acompanhamento e rastreio do pedido', () => {
  it('só mostra o pedido com número e e-mail corretos, sem textos internos', async () => {
    const { store, product } = await createStore(5);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    const number = await paidOrder(store.slug, store, product.id, token);
    const query = (n: string, email: string, slug = store.slug) => `/order-tracking?store=${slug}&number=${encodeURIComponent(n)}&email=${encodeURIComponent(email)}`;

    expect((await api(query(number, 'outra@example.com'))).status).toBe(404);
    expect((await api(query('PED-0', 'maria@example.com'))).status).toBe(404);
    const other = await createStore();
    expect((await api(query(number, 'maria@example.com', other.store.slug))).status).toBe(404);

    const before = await api(query(number, 'MARIA@example.com'));
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ number, status: 'INVOICED', statusLabel: 'Nota fiscal emitida', tracking: null });
    expect(JSON.stringify(before.body)).not.toContain('manualmente');

    const ship = await api(`/orders/${number}/ship`, { method: 'POST', token, body: { carrier: 'Correios', trackingCode: 'ab123456789br' } });
    expect(ship.status).toBe(200);
    const after = await api(query(number, 'maria@example.com'));
    expect(after.body.status).toBe('SHIPPED');
    expect(after.body.tracking).toMatchObject({ carrier: 'Correios', code: 'AB123456789BR' });
    expect(after.body.tracking.url).toContain('rastreamento.correios.com.br');
    expect(after.body.items[0]).toEqual({ name: 'Vaso azul', quantity: 1 });
  });

  it('marca como enviado o pedido faturado cujo rastreio apareceu no Bling', async () => {
    const { store, product } = await createStore(5);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    await prisma.blingConnection.create({ data: { storeId: store.id, companyId: '1', accessTokenEnc: encryptSecret('a', resolveJwtSecret()), refreshTokenEnc: encryptSecret('r', resolveJwtSecret()), expiresAt: new Date(Date.now() + 3_600_000) } });
    const number = await paidOrder(store.slug, store, product.id, token);
    const order = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number } });
    await prisma.blingOrderSync.upsert({ where: { orderId: order.id }, create: { storeId: store.id, orderId: order.id, status: 'SENT', blingOrderId: '777' }, update: { status: 'SENT', blingOrderId: '777' } });

    remote['777'] = { transporte: { volumes: [{ servico: 'PAC' }] } };
    expect((await api('/bling/tracking-sync', { method: 'POST', token })).body).toMatchObject({ checked: 1, shipped: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('INVOICED');

    remote['777'] = { transporte: { volumes: [{ servico: 'PAC', codigoRastreamento: 'AB123456789BR' }] } };
    expect((await api('/bling/tracking-sync', { method: 'POST', token })).body).toMatchObject({ checked: 1, shipped: 1 });
    const shipped = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { fulfillment: true } });
    expect(shipped.status).toBe('SHIPPED');
    expect(shipped.fulfillment).toMatchObject({ carrier: 'PAC', trackingCode: 'AB123456789BR' });
    expect((await api('/bling/tracking-sync', { method: 'POST', token })).body).toMatchObject({ checked: 0, shipped: 0 }); // idempotente
    expect(await prisma.outboxEvent.count({ where: { storeId: store.id, eventName: 'orders.order-shipped.v1' } })).toBe(1);
  });
});
