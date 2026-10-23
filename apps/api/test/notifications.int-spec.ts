import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';
import { MAIL_PROVIDER, MailProvider, OutgoingMail } from '../src/modules/notifications/mail-provider';
import { OutboxDispatcher } from '../src/modules/notifications/outbox-dispatcher';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';

class FakeMail implements MailProvider {
  sent: OutgoingMail[] = [];
  failNext = false;
  async send(mail: OutgoingMail) {
    if (this.failNext) { this.failNext = false; throw new Error('provedor fora do ar'); }
    this.sent.push(mail);
    return { status: 'SENT' as const, providerId: 'm1' };
  }
}

const fake = new FakeMail();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let dispatcher: OutboxDispatcher;

beforeAll(async () => {
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue(fake)));
  dispatcher = app.get(OutboxDispatcher);
});
afterAll(() => cleanup(app));

describe('e-mails transacionais via outbox', () => {
  it('envia a cada etapa do pedido, registra no painel, repete se o provedor falhar e não duplica', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['orders.read', 'orders.write', 'settings.write']);
    // Processa o que ficou de outros testes antes de medir.
    await dispatcher.dispatchOnce();
    fake.sent.length = 0;

    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });

    fake.failNext = true; // o primeiro envio falha, o evento fica para a próxima rodada
    await dispatcher.dispatchOnce();
    expect(await prisma.outboxEvent.count({ where: { storeId: store.id, publishedAt: null, eventName: { startsWith: 'orders.' } } })).toBeGreaterThan(0);
    await dispatcher.dispatchOnce();
    await dispatcher.dispatchOnce(); // já processado: nada novo

    const mine = fake.sent.filter(m => m.to === 'maria@example.com');
    expect(mine.map(m => m.subject).sort()).toEqual([`Pagamento confirmado – pedido ${order.body.number}`, `Recebemos seu pedido ${order.body.number}`].sort());

    await api(`/orders/${order.body.number}/pick`, { method: 'POST', token: admin, body: {} });
    await api(`/orders/${order.body.number}/invoice`, { method: 'POST', token: admin, body: { invoiceNumber: '9' } });
    await api(`/orders/${order.body.number}/ship`, { method: 'POST', token: admin, body: { carrier: 'Correios', trackingCode: 'BR123' } });
    await dispatcher.dispatchOnce();
    const shipped = fake.sent.find(m => m.subject.includes('foi enviado'));
    expect(shipped?.text).toContain('BR123');

    const log = await api('/notifications/emails', { token: admin });
    expect(log.status).toBe(200);
    expect(log.body.items.map((e: { status: string }) => e.status)).toEqual(expect.arrayContaining(['SENT', 'FAILED']));
    expect(log.body.provider).toBe('simulated');
    // Outra loja não enxerga os e-mails desta.
    const other = await createStore();
    expect((await api('/notifications/emails', { token: await login(api, other.store, ['settings.write']) })).body.total).toBe(0);
    expect((await api('/notifications/emails', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
  });

  it('cobrança recusada no checkout não manda "pedido recebido" nem "cancelado"; o pedido recebido espera a cobrança sair', async () => {
    const { store, product } = await createStore(10);
    await dispatcher.dispatchOnce();
    fake.sent.length = 0;
    const declined = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    const declinedOrder = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number: declined.body.number } });
    await app.get(OrderLifecycleService).cancel({ orderId: declinedOrder.id }, { message: 'Cartão recusado', atCheckout: true });

    const charging = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    const chargingOrder = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number: charging.body.number } });
    await prisma.payment.updateMany({ where: { orderId: chargingOrder.id }, data: { provider: 'pending' } }); // como se o gateway ainda respondesse
    await dispatcher.dispatchOnce();
    expect(fake.sent.filter(m => m.subject.includes(declined.body.number) || m.subject.includes(charging.body.number))).toEqual([]);
    expect(await prisma.outboxEvent.findFirst({ where: { aggregateId: chargingOrder.id, eventName: 'orders.order-created.v1' } })).toMatchObject({ publishedAt: null, attempts: 0 });

    await prisma.payment.updateMany({ where: { orderId: chargingOrder.id }, data: { provider: 'manual' } });
    await dispatcher.dispatchOnce();
    expect(fake.sent.map(m => m.subject)).toEqual([`Recebemos seu pedido ${charging.body.number}`]);
  });
});
