import { NestExpressApplication } from '@nestjs/platform-express';
import { CustomersService } from '../src/modules/customers/customers.service';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('CRM 360', () => {
  it('monta perfil com linha do tempo, anotações, etiquetas, filtro e exportação', async () => {
    const { store, product } = await createStore(20);
    const other = await createStore();
    const admin = await login(api, store, ['orders.read', 'orders.write']);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    const customer = await prisma.customer.findFirstOrThrow({ where: { storeId: store.id } });
    await prisma.newsletterSubscriber.create({ data: { storeId: store.id, email: customer.email } });

    expect((await api(`/customers/${customer.id}/notes`, { method: 'POST', token: admin, body: { body: '   ' } })).status).toBe(400);
    const note = await api(`/customers/${customer.id}/notes`, { method: 'POST', token: admin, body: { body: 'Prefere entrega à tarde' } });
    expect(note.status).toBe(201);
    expect(note.body.authorName).toBe('Admin');

    await api(`/customers/${customer.id}`, { method: 'PATCH', token: admin, body: { tags: ['VIP ', 'atacado'] } });

    const profile = await api(`/customers/${customer.id}`, { token: admin });
    expect(profile.status).toBe(200);
    expect(profile.body.noteEntries).toHaveLength(1);
    expect(profile.body.favoriteCategories).toEqual([{ name: 'Casa', quantity: 2 }]);
    expect(profile.body.newsletter).toMatchObject({ subscribed: true });
    expect(profile.body.stats).toMatchObject({ paidOrders: 1, daysSinceLastPurchase: 0, averageDaysBetweenOrders: null });
    const kinds = profile.body.timeline.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['SIGNUP', 'ORDER', 'NOTE']));

    expect((await api('/customers/tags', { token: admin })).body).toEqual([{ tag: 'atacado', total: 1 }, { tag: 'vip', total: 1 }]);
    expect((await api('/customers?tag=VIP', { token: admin })).body.total).toBe(1);
    expect((await api('/customers?tag=nada', { token: admin })).body.total).toBe(0);

    const csv = await app.get(CustomersService).exportCsv(store.id, { tag: 'vip' });
    expect(csv.trim().split('\r\n')).toHaveLength(2);
    expect(csv).toContain('vip, atacado');
    expect((await app.get(CustomersService).exportCsv(store.id, { tag: 'nada' })).trim().split('\r\n')).toHaveLength(1);

    // isolamento entre lojas
    const foreign = await login(api, other.store, ['orders.read', 'orders.write']);
    expect((await api(`/customers/${customer.id}`, { token: foreign })).status).toBe(404);
    expect((await api(`/customers/${customer.id}/notes`, { method: 'POST', token: foreign, body: { body: 'x' } })).status).toBe(404);
    expect((await api(`/customers/${customer.id}/notes/${note.body.id}`, { method: 'DELETE', token: foreign })).status).toBe(404);

    expect((await api(`/customers/${customer.id}/notes/${note.body.id}`, { method: 'DELETE', token: admin })).status).toBe(200);
    expect((await api(`/customers/${customer.id}`, { token: admin })).body.noteEntries).toHaveLength(0);

    // LGPD apaga anotações
    await api(`/customers/${customer.id}/notes`, { method: 'POST', token: admin, body: { body: 'sigilo' } });
    await api(`/customers/${customer.id}/anonymize`, { method: 'POST', token: admin });
    expect(await prisma.customerNote.count({ where: { customerId: customer.id } })).toBe(0);
  });
});
