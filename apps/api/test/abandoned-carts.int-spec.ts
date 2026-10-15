import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';
import { MAIL_PROVIDER, MailProvider, OutgoingMail } from '../src/modules/notifications/mail-provider';
import { AbandonedCartsService } from '../src/modules/abandoned-carts/abandoned-carts.service';

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
let carts: AbandonedCartsService;

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue(fake)));
  carts = app.get(AbandonedCartsService);
});
afterAll(() => cleanup(app));

const idle = (id: string, minutes: number) => prisma.abandonedCart.update({ where: { id }, data: { lastActivityAt: new Date(Date.now() - minutes * 60_000) } });

describe('carrinho abandonado', () => {
  it('guarda o carrinho com preço do catálogo, lembra uma única vez e entrega o link de recuperação', async () => {
    const { store, product, draft } = await createStore(10);
    const capture = await api('/abandoned-carts/capture', { method: 'POST', body: { storeSlug: store.slug, email: ' Ana@Example.com ', name: 'Ana Souza', items: [{ productId: product.id, quantity: 2 }, { productId: draft.id, quantity: 1 }] } });
    expect(capture.body).toEqual({ captured: true });
    const cart = await prisma.abandonedCart.findFirstOrThrow({ where: { storeId: store.id } });
    expect(cart.email).toBe('ana@example.com');
    expect(cart.itemCount).toBe(2); // o rascunho não entra
    expect(cart.subtotal.toFixed(2)).toBe('99.80');

    fake.sent.length = 0;
    await carts.sweep();
    expect(fake.sent.filter(m => m.to === 'ana@example.com')).toHaveLength(0); // ainda dentro do prazo

    await idle(cart.id, 120);
    await carts.sweep();
    const mails = fake.sent.filter(m => m.to === 'ana@example.com');
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain(`https://loja.example.com/recuperar/${cart.token}`);
    expect(mails[0].text).toContain('2x Vaso azul');
    await carts.sweep();
    expect(fake.sent.filter(m => m.to === 'ana@example.com')).toHaveLength(1); // sem repetição
    expect(await prisma.emailLog.count({ where: { storeId: store.id, template: 'cart-reminder' } })).toBe(1);

    const recovered = await api(`/abandoned-carts/recover/${cart.token}`);
    expect(recovered.status).toBe(200);
    expect(recovered.body.storeSlug).toBe(store.slug);
    expect(recovered.body.items[0]).toMatchObject({ productId: product.id, quantity: 2, price: '49.9' });
    expect((await api('/abandoned-carts/recover/token-que-nao-existe')).status).toBe(404);
  });

  it('falha no envio devolve o carrinho para a fila; fechar o pedido tira da fila', async () => {
    const { store, product } = await createStore(10);
    await api('/abandoned-carts/capture', { method: 'POST', body: { storeSlug: store.slug, email: 'maria@example.com', items: [{ productId: product.id, quantity: 1 }] } });
    const cart = await prisma.abandonedCart.findFirstOrThrow({ where: { storeId: store.id } });
    await idle(cart.id, 120);
    fake.failNext = true;
    await carts.sweep();
    expect((await prisma.abandonedCart.findUniqueOrThrow({ where: { id: cart.id } })).status).toBe('OPEN');

    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') }); // e-mail Maria@Example.com
    expect(order.status).toBe(201);
    const after = await prisma.abandonedCart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(after.status).toBe('RECOVERED');
    fake.sent.length = 0;
    await carts.sweep();
    expect(fake.sent.filter(m => m.to === 'maria@example.com')).toHaveLength(0);
  });

  it('quem pede para sair não recebe mais lembrete, nem se voltar ao checkout', async () => {
    const { store, product } = await createStore(10);
    const body = { storeSlug: store.slug, email: 'bia@example.com', items: [{ productId: product.id, quantity: 1 }] };
    await api('/abandoned-carts/capture', { method: 'POST', body });
    const cart = await prisma.abandonedCart.findFirstOrThrow({ where: { storeId: store.id } });
    expect((await api(`/abandoned-carts/optout/${cart.token}`, { method: 'POST', body: {} })).status).toBe(200);
    expect((await api('/abandoned-carts/capture', { method: 'POST', body })).body).toEqual({ captured: false });
    await idle(cart.id, 120);
    fake.sent.length = 0;
    await carts.sweep();
    expect(fake.sent.filter(m => m.to === 'bia@example.com')).toHaveLength(0);
  });

  it('painel lista e permite lembrar na hora, só com permissão', async () => {
    const { store, product } = await createStore(10);
    await api('/abandoned-carts/capture', { method: 'POST', body: { storeSlug: store.slug, email: 'carla@example.com', name: 'Carla', items: [{ productId: product.id, quantity: 1 }] } });
    expect((await api('/abandoned-carts/admin')).status).toBe(401);
    const reader = await login(api, store, ['orders.read']);
    const list = await api('/abandoned-carts/admin', { token: reader });
    expect(list.status).toBe(200);
    expect(list.body.stats).toMatchObject({ open: 1, reminded: 0, recovered: 0, pendingValue: '49.90' });
    expect(list.body.siteConfigured).toBe(true);
    const id = list.body.items[0].id;
    expect((await api(`/abandoned-carts/admin/${id}/remind`, { method: 'POST', token: reader, body: {} })).status).toBe(403);
    const writer = await login(api, store, ['orders.read', 'orders.write']);
    fake.sent.length = 0;
    expect((await api(`/abandoned-carts/admin/${id}/remind`, { method: 'POST', token: writer, body: {} })).status).toBe(200);
    expect(fake.sent).toHaveLength(1);
    expect((await prisma.abandonedCart.findUniqueOrThrow({ where: { id } })).status).toBe('REMINDED');
  });
});
