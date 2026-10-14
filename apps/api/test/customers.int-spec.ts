import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('CRM de clientes', () => {
  it('segmenta, mostra perfil 360° com LTV e isola por loja', async () => {
    const { store, product } = await createStore(20);
    const other = await createStore();
    const admin = await login(api, store, ['orders.read', 'orders.write']);
    const buy = async (email: string, quantity: number, pay: boolean) => {
      const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity }], 'BOLETO'), customer: { name: email.split('@')[0], email } } });
      if (pay) await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    };
    await buy('nova@example.com', 1, true);
    await buy('curiosa@example.com', 1, false);
    await buy('vip@example.com', 1, true);
    await buy('vip@example.com', 1, true);
    for (let i = 0; i < 3; i++) await buy('vip@example.com', 1, true);

    const all = await api('/customers', { token: admin });
    expect(all.status).toBe(200);
    expect(all.body.segments).toMatchObject({ NEW: 1, PROSPECT: 1, VIP: 1, RECURRING: 0, AT_RISK: 0 });
    expect(all.body.items[0]).toMatchObject({ email: 'vip@example.com', paidOrders: 5, totalSpent: '249.50', segment: 'VIP' });
    expect((await api('/customers?segment=PROSPECT', { token: admin })).body.items.map((c: { email: string }) => c.email)).toEqual(['curiosa@example.com']);
    expect((await api('/customers?q=NOVA', { token: admin })).body.total).toBe(1);
    expect((await api('/customers?segment=XPTO', { token: admin })).status).toBe(400);

    const id = all.body.items[0].id;
    const profile = await api(`/customers/${id}`, { token: admin });
    expect(profile.body.stats).toMatchObject({ paidOrders: 5, ltv: '249.50', averageTicket: '49.90', segment: 'VIP' });
    expect(profile.body.orders).toHaveLength(5);

    // Cliente que parou de comprar vira "em risco" (compra paga há mais de 90 dias).
    await prisma.order.updateMany({ where: { customerId: id }, data: { createdAt: new Date(Date.now() - 120 * 86_400_000) } });
    expect((await api('/customers?segment=AT_RISK', { token: admin })).body.total).toBe(1);
    expect((await api(`/customers/${id}`, { token: admin })).body.stats.segment).toBe('AT_RISK');

    const outsider = await login(api, other.store, ['orders.read', 'orders.write']);
    expect((await api(`/customers/${id}`, { token: outsider })).status).toBe(404);
    expect((await api('/customers', { token: outsider })).body.total).toBe(0);
  });

  it('edita notas e etiquetas, e anonimiza (LGPD) preservando os pedidos', async () => {
    const { store, product } = await createStore();
    const admin = await login(api, store, ['orders.read', 'orders.write']);
    const reader = await login(api, store, ['orders.read']);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    const id = (await api('/customers', { token: admin })).body.items[0].id;

    expect((await api(`/customers/${id}`, { method: 'PATCH', token: reader, body: { notes: 'x' } })).status).toBe(403);
    const edited = await api(`/customers/${id}`, { method: 'PATCH', token: admin, body: { notes: 'Prefere entrega à tarde', tags: ['Atacado', 'atacado', ' presente '], marketingOptIn: true } });
    expect(edited.body).toMatchObject({ notes: 'Prefere entrega à tarde', tags: ['atacado', 'presente'], marketingOptIn: true });

    expect((await api(`/customers/${id}/anonymize`, { method: 'POST', token: admin, body: {} })).status).toBe(200);
    expect((await api(`/customers/${id}/anonymize`, { method: 'POST', token: admin, body: {} })).status).toBe(404);
    expect((await api('/customers', { token: admin })).body.total).toBe(0);
    const kept = await api(`/orders/${order.body.number}`, { token: admin });
    expect(kept.status).toBe(200);
    expect(kept.body.customer).toMatchObject({ name: 'Cliente anonimizado', notes: null });
    expect(JSON.stringify(kept.body.customer)).not.toContain('maria');
  });
});
