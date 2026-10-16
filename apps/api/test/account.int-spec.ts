import { NestExpressApplication } from '@nestjs/platform-express';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';
import { checkoutBody, cleanup, createStore, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
const sent: { to: string; subject: string; text: string }[] = [];

beforeAll(async () => {
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue({ send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { status: 'SIMULATED' }; } })));
});
afterAll(() => cleanup(app));

const codeFor = (email: string) => sent.filter(m => m.to === email).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];

async function signIn(storeSlug: string, email = 'maria@example.com') {
  sent.length = 0;
  expect((await api('/account/login/request', { method: 'POST', body: { storeSlug, email: email.toUpperCase() } })).status).toBe(202);
  const code = codeFor(email);
  expect(code).toBeDefined();
  const verified = await api('/account/login/verify', { method: 'POST', body: { storeSlug, email, code } });
  expect(verified.status).toBe(200);
  return verified.body.token as string;
}

describe('área do cliente', () => {
  it('entra com código por e-mail e vê só os próprios pedidos, com detalhe e Pix pendente', async () => {
    const { store, product } = await createStore(5);
    const first = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'PIX') });
    const second = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]), customer: { name: 'Outra Pessoa', email: 'outra@example.com' }, cpf: '111.444.777-35' } });
    await app.get(OrderLifecycleService).markPaid({ storeId: store.id, number: second.body.number });

    const token = await signIn(store.slug);
    const headers = { 'x-customer-token': token };
    const me = await api('/account/me', { headers });
    expect(me.body).toMatchObject({ name: 'Maria Silva', email: 'maria@example.com', document: '***.***.247-25', orders: 2 });
    expect(me.body.address).toMatchObject({ street: 'Av. Paulista' });

    const orders = await api('/account/orders', { headers });
    expect(orders.body.map((o: { number: string }) => o.number).sort()).toEqual([first.body.number, second.body.number].sort());

    const detail = await api(`/account/orders/${first.body.number}`, { headers });
    expect(detail.body).toMatchObject({ number: first.body.number, statusLabel: expect.any(String), items: [{ name: 'Vaso azul', quantity: 2 }] });
    expect(detail.body.payment.instructions).toBeTruthy(); // Pix ainda pode ser pago
    const paid = await api(`/account/orders/${second.body.number}`, { headers });
    expect(paid.body.payment.instructions).toBeNull();

    // Pedido de outra pessoa não aparece.
    const other = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, customer: { email: 'outra@example.com' } } });
    expect((await api(`/account/orders/${other.number}`, { headers })).status).toBe(404);

    const updated = await api('/account/me', { method: 'PATCH', headers, body: { name: 'Maria S. Souza', phone: '(11) 98888-7777', marketingOptIn: true } });
    expect(updated.body).toMatchObject({ name: 'Maria S. Souza', phone: '11988887777', marketingOptIn: true });

    expect((await api('/account/logout', { method: 'POST', headers })).status).toBe(200);
    expect((await api('/account/me', { headers })).status).toBe(401);
  });

  it('não revela quem é cliente, recusa código errado e bloqueia após 5 tentativas', async () => {
    const { store, product } = await createStore(5);
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    sent.length = 0;
    const unknown = await api('/account/login/request', { method: 'POST', body: { storeSlug: store.slug, email: 'ninguem@example.com' } });
    expect(unknown).toMatchObject({ status: 202, body: { sent: true } });
    expect(sent).toHaveLength(0);

    await api('/account/login/request', { method: 'POST', body: { storeSlug: store.slug, email: 'maria@example.com' } });
    const code = codeFor('maria@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await api('/account/login/verify', { method: 'POST', body: { storeSlug: store.slug, email: 'maria@example.com', code: wrong } })).status).toBe(400);
    // Depois de 5 erros, nem o código certo vale.
    expect((await api('/account/login/verify', { method: 'POST', body: { storeSlug: store.slug, email: 'maria@example.com', code } })).status).toBe(400);
    // O e-mail registrado no log não guarda o código.
    const log = await prisma.emailLog.findFirstOrThrow({ where: { storeId: store.id, template: 'account.login-code' } });
    expect(log.body).not.toContain(code);
    expect(log.subject).not.toContain(code);
  });

  it('código usado não vale de novo e sessão de uma loja não abre outra', async () => {
    const a = await createStore(5);
    const b = await createStore(5);
    await api('/checkout', { method: 'POST', body: checkoutBody(a.store.slug, [{ productId: a.product.id, quantity: 1 }]) });
    const token = await signIn(a.store.slug);
    const code = codeFor('maria@example.com');
    expect((await api('/account/login/verify', { method: 'POST', body: { storeSlug: a.store.slug, email: 'maria@example.com', code } })).status).toBe(400);
    expect((await api('/account/login/verify', { method: 'POST', body: { storeSlug: b.store.slug, email: 'maria@example.com', code } })).status).toBe(400);
    expect((await api('/account/orders', { headers: { 'x-customer-token': token } })).body).toHaveLength(1);
    expect((await api('/account/orders', { headers: { 'x-customer-token': 'inventado' } })).status).toBe(401);
  });
});
