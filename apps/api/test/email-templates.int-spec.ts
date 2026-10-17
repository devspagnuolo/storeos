import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';
import { MAIL_PROVIDER, MailProvider, OutgoingMail } from '../src/modules/notifications/mail-provider';
import { OutboxDispatcher } from '../src/modules/notifications/outbox-dispatcher';
import { AbandonedCartsService } from '../src/modules/abandoned-carts/abandoned-carts.service';

class FakeMail implements MailProvider {
  sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail) { this.sent.push(mail); return { status: 'SENT' as const, providerId: 'm1' }; }
}
const fake = new FakeMail();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue(fake)));
});
afterAll(() => cleanup(app));

describe('modelos de e-mail editáveis', () => {
  it('lista os padrões, valida, salva, usa no envio, desliga e restaura', async () => {
    const { store, product } = await createStore(10);
    const dispatcher = app.get(OutboxDispatcher);
    const admin = await login(api, store, ['settings.write', 'orders.write', 'orders.read']);
    const reader = await login(api, store, ['orders.read']);
    expect((await api('/notifications/templates', { token: reader })).status).toBe(403);

    const list = await api('/notifications/templates', { token: admin });
    expect(list.body.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['order-created', 'order-paid', 'order-shipped', 'cart-reminder']));
    expect(list.body.find((t: { key: string }) => t.key === 'order-paid')).toMatchObject({ customized: false, enabled: true, subject: 'Pagamento confirmado – pedido {{pedido}}' });

    const bad = await api('/notifications/templates/order-paid', { method: 'PUT', token: admin, body: { subject: 'Oi', body: 'Seu CPF {{cpf}}' } });
    expect(bad.status).toBe(400);
    expect((await api('/notifications/templates/inexistente', { method: 'PUT', token: admin, body: { subject: 'a', body: 'b' } })).status).toBe(404);

    const preview = await api('/notifications/templates/order-paid/preview', { method: 'POST', token: admin, body: { subject: 'Pago {{pedido}}', body: 'Valeu, {{nome}}!' } });
    expect(preview.body.subject).toContain('Pago 00001');
    expect(preview.body.text).toContain('Valeu, Maria!');

    const save = await api('/notifications/templates/order-paid', { method: 'PUT', token: admin, body: { subject: 'Pago! Pedido {{pedido}}', body: 'Obrigada pela compra, {{nome}}! Total {{total}}.' } });
    expect(save.status).toBe(200);

    await dispatcher.dispatchOnce(); fake.sent.length = 0;
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    await dispatcher.dispatchOnce();
    const paid = fake.sent.find(m => m.subject.startsWith('Pago!'));
    expect(paid?.text).toContain('Obrigada pela compra, Maria!');
    expect(paid?.subject).toContain(order.body.number);

    // desligado: o aviso de pagamento não sai
    await api('/notifications/templates/order-created', { method: 'PUT', token: admin, body: { subject: 'x {{pedido}}', body: 'y', enabled: false } });
    fake.sent.length = 0;
    const second = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), customer: { name: 'Joana', email: 'joana@example.com' } } });
    expect(second.status).toBe(201);
    await dispatcher.dispatchOnce();
    expect(fake.sent.filter(m => m.to === 'joana@example.com')).toHaveLength(0);

    // restaurar volta ao padrão
    expect((await api('/notifications/templates/order-paid', { method: 'DELETE', token: admin })).status).toBe(204);
    const after = await api('/notifications/templates', { token: admin });
    expect(after.body.find((t: { key: string }) => t.key === 'order-paid')).toMatchObject({ customized: false, subject: 'Pagamento confirmado – pedido {{pedido}}' });
  });

  it('lembrete de carrinho desligado não é enviado nem consumido', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['settings.write']);
    await api('/abandoned-carts/capture', { method: 'POST', body: { storeSlug: store.slug, email: 'lia@example.com', items: [{ productId: product.id, quantity: 1 }] } });
    const cart = await prisma.abandonedCart.findFirstOrThrow({ where: { storeId: store.id } });
    await prisma.abandonedCart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date(Date.now() - 2 * 3600_000) } });
    await api('/notifications/templates/cart-reminder', { method: 'PUT', token: admin, body: { subject: 'Volte {{nome}}', body: 'Seus itens: {{itens}} {{link_carrinho}}', enabled: false } });
    fake.sent.length = 0;
    await app.get(AbandonedCartsService).sweep();
    expect(fake.sent.filter(m => m.to === 'lia@example.com')).toHaveLength(0);
    expect((await prisma.abandonedCart.findUniqueOrThrow({ where: { id: cart.id } })).status).toBe('OPEN');
    await api('/notifications/templates/cart-reminder', { method: 'PUT', token: admin, body: { subject: 'Volte {{nome}}', body: 'Seus itens: {{itens}} {{link_carrinho}}', enabled: true } });
    await app.get(AbandonedCartsService).sweep();
    const mail = fake.sent.find(m => m.to === 'lia@example.com');
    expect(mail?.subject).toBe('Volte cliente');
    expect(mail?.text).toContain('Não quer receber este lembrete?');
  });
});
