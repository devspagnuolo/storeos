import { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac } from 'node:crypto';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';
import { MercadoPagoClient, MercadoPagoPayment } from '../src/modules/payments/mercado-pago.client';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

/** Mercado Pago falso: guarda os pagamentos criados e deixa o teste mudar o status. */
class FakeMercadoPago {
  configured = true;
  failNext = false;
  payments = new Map<string, MercadoPagoPayment>();
  private nextId = 1000;

  publicKey: string | undefined = 'TEST-public-key';
  cardOutcome: { status: MercadoPagoPayment['status']; detail?: string } = { status: 'approved' };
  lastRequest: Record<string, unknown> | undefined;

  async createPayment(input: { method: string; amount: number; orderNumber: string }) {
    if (this.failNext) { this.failNext = false; throw new Error('gateway fora do ar'); }
    this.lastRequest = input;
    if (input.method === 'card') {
      const card: MercadoPagoPayment = { id: this.nextId++, status: this.cardOutcome.status, status_detail: this.cardOutcome.detail, external_reference: input.orderNumber, transaction_amount: input.amount };
      this.payments.set(String(card.id), card);
      return card;
    }
    if (input.method === 'boleto') {
      const boleto: MercadoPagoPayment = { id: this.nextId++, status: 'pending', external_reference: input.orderNumber, transaction_amount: input.amount, transaction_details: { external_resource_url: 'https://mp.test/boleto' }, barcode: { content: '23790000' } };
      this.payments.set(String(boleto.id), boleto);
      return boleto;
    }
    const payment: MercadoPagoPayment = { id: this.nextId++, status: 'pending', external_reference: input.orderNumber, transaction_amount: input.amount, point_of_interaction: { transaction_data: { qr_code: `pix-${input.orderNumber}`, qr_code_base64: 'iVBORw0KGgo=' } } };
    this.payments.set(String(payment.id), payment);
    return payment;
  }

  async getPayment(id: string) {
    const payment = this.payments.get(id);
    if (!payment) throw new Error('não encontrado');
    return payment;
  }

  setStatus(id: string, status: MercadoPagoPayment['status']) {
    this.payments.get(id)!.status = status;
  }
}

const mercadoPago = new FakeMercadoPago();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp(builder => builder.overrideProvider(MercadoPagoClient).useValue(mercadoPago))));
afterAll(() => cleanup(app));
afterEach(() => { delete process.env.MERCADOPAGO_WEBHOOK_SECRET; });

const orderOf = (number: string) => prisma.order.findFirstOrThrow({ where: { number }, include: { payments: true, timeline: true } });
const webhook = (id: string, headers: Record<string, string> = {}) => api(`/payments/webhooks/mercadopago?data.id=${id}&type=payment`, { method: 'POST', body: { type: 'payment', action: 'payment.updated', data: { id } }, headers });

describe('PIX pelo Mercado Pago', () => {
  it('gera QR code no checkout e confirma o pedido pelo webhook, uma única vez', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }]) });
    expect(checkout.status).toBe(201);
    expect(checkout.body.payment.instructions).toMatchObject({ pixCode: `pix-${checkout.body.number}`, qrCodeBase64: 'iVBORw0KGgo=' });
    const { payments: [payment] } = await orderOf(checkout.body.number);
    expect(payment).toMatchObject({ provider: 'mercadopago', status: 'PENDING' });
    expect(payment.expiresAt).toBeInstanceOf(Date);

    mercadoPago.setStatus(payment.transactionId!, 'approved');
    expect((await webhook(payment.transactionId!)).status).toBe(200);
    expect((await webhook(payment.transactionId!)).status).toBe(200);

    const paid = await orderOf(checkout.body.number);
    expect(paid.status).toBe('PAID');
    expect(paid.payments[0].status).toBe('PAID');
    expect(paid.timeline.filter(t => t.status === 'PAID')).toHaveLength(1);
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 3, reserved: 0 });
  });

  it('cancela e devolve o estoque quando o PIX é cancelado', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    const { payments: [payment] } = await orderOf(checkout.body.number);
    mercadoPago.setStatus(payment.transactionId!, 'cancelled');
    await webhook(payment.transactionId!);
    expect((await orderOf(checkout.body.number)).status).toBe('CANCELLED');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });

  it('cancela o pedido e libera o estoque se o gateway falhar', async () => {
    const { store, product } = await createStore(5);
    mercadoPago.failNext = true;
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }]) });
    expect(checkout.status).toBe(502);
    const [order] = await prisma.order.findMany({ where: { storeId: store.id } });
    expect(order.status).toBe('CANCELLED');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });

  it('exige assinatura válida quando o segredo do webhook está configurado', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    const { payments: [payment] } = await orderOf(checkout.body.number);
    const id = payment.transactionId!;
    mercadoPago.setStatus(id, 'approved');
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'segredo';
    expect((await webhook(id, { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r1' })).status).toBe(401);
    expect((await orderOf(checkout.body.number)).status).toBe('AWAITING_PAYMENT');
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac('sha256', 'segredo').update(`id:${id};request-id:r1;ts:${ts};`).digest('hex');
    expect((await webhook(id, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r1' })).status).toBe(200);
    expect((await orderOf(checkout.body.number)).status).toBe('PAID');
  });

  it('ignora notificação de pagamento desconhecido', async () => {
    expect((await webhook('999999')).status).toBe(200);
  });
});

describe('operação manual de pedidos', () => {
  // Sem gateway configurado a loja opera à mão.
  beforeEach(() => { mercadoPago.configured = false; });
  afterEach(() => { mercadoPago.configured = true; });

  it('boleto fica manual; a loja confirma o pagamento e o estoque é baixado', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
    expect((await orderOf(checkout.body.number)).payments[0].provider).toBe('manual');
    const viewer = await login(api, store, ['orders.read']);
    expect((await api(`/orders/${checkout.body.number}/confirm-payment`, { method: 'POST', body: {}, token: viewer })).status).toBe(403);
    const operator = await login(api, store, ['orders.read', 'orders.write']);
    const confirmed = await api(`/orders/${checkout.body.number}/confirm-payment`, { method: 'POST', body: {}, token: operator });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('PAID');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 3, reserved: 0 });
    expect((await api(`/orders/${checkout.body.number}/cancel`, { method: 'POST', body: {}, token: operator })).status).toBe(409);
    const list = await api('/orders?status=PAID', { token: operator });
    expect(list.body).toMatchObject({ total: 1, items: [{ number: checkout.body.number }] });
  });

  it('a loja cancela um pedido pendente e o estoque volta', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 4 }], 'BOLETO') });
    const operator = await login(api, store, ['orders.write']);
    expect((await api(`/orders/${checkout.body.number}/cancel`, { method: 'POST', body: { message: 'Cliente desistiu' }, token: operator })).status).toBe(200);
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });

  it('expira pedidos com prazo vencido e libera a reserva', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 3 }], 'BOLETO') });
    await prisma.payment.updateMany({ where: { order: { number: checkout.body.number } }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const expired = await app.get(OrderLifecycleService).expireOverdue();
    expect(expired).toBeGreaterThanOrEqual(1);
    expect((await orderOf(checkout.body.number)).status).toBe('CANCELLED');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });
});

describe('cartão e boleto pelo Mercado Pago', () => {
  const cpf = '529.982.247-25';
  const card = { token: 'tok_abcdef12', paymentMethodId: 'visa', installments: 3 };
  const pay = (slug: string, productId: string, extra: Record<string, unknown>, method = 'CREDIT_CARD') => api('/checkout', { method: 'POST', body: { ...checkoutBody(slug, [{ productId, quantity: 2 }], method), ...extra } });
  afterEach(() => { mercadoPago.cardOutcome = { status: 'approved' }; mercadoPago.publicKey = 'TEST-public-key'; });

  it('expõe a chave pública e o limite de parcelas, e some sem chave', async () => {
    expect((await api('/payments/config')).body).toEqual({ card: { provider: 'mercadopago', publicKey: 'TEST-public-key', maxInstallments: 12 } });
    mercadoPago.publicKey = undefined;
    expect((await api('/payments/config')).body).toEqual({ card: null });
  });

  it('cartão aprovado confirma o pedido na hora e baixa o estoque', async () => {
    const { store, product } = await createStore(5);
    const checkout = await pay(store.slug, product.id, { cpf, card });
    expect(checkout.status).toBe(201);
    expect(checkout.body.status).toBe('PAID');
    expect(mercadoPago.lastRequest).toMatchObject({ method: 'card', card: { token: 'tok_abcdef12', installments: 3, paymentMethodId: 'visa' } });
    const order = await orderOf(checkout.body.number);
    expect(order.payments[0]).toMatchObject({ provider: 'mercadopago', status: 'PAID' });
    expect(JSON.stringify(order.payments[0].instructions)).not.toContain('tok_abcdef12');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 3, reserved: 0 });
    // O webhook que chega depois não muda nada.
    expect((await webhook(order.payments[0].transactionId!)).status).toBe(200);
    expect((await orderOf(checkout.body.number)).timeline.filter(t => t.status === 'PAID')).toHaveLength(1);
  });

  it('cartão recusado devolve 402, cancela o pedido e libera o estoque', async () => {
    const { store, product } = await createStore(5);
    mercadoPago.cardOutcome = { status: 'rejected', detail: 'cc_rejected_insufficient_amount' };
    const checkout = await pay(store.slug, product.id, { cpf, card });
    expect(checkout.status).toBe(402);
    expect(checkout.body.message).toMatch(/limite/);
    const [order] = await prisma.order.findMany({ where: { storeId: store.id } });
    expect(order.status).toBe('CANCELLED');
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });

  it('cartão em análise fica aguardando e o webhook aprova depois', async () => {
    const { store, product } = await createStore(5);
    mercadoPago.cardOutcome = { status: 'in_process', detail: 'pending_contingency' };
    const checkout = await pay(store.slug, product.id, { cpf, card });
    expect(checkout.status).toBe(201);
    expect(checkout.body.status).toBe('AWAITING_PAYMENT');
    const { payments: [payment] } = await orderOf(checkout.body.number);
    mercadoPago.setStatus(payment.transactionId!, 'approved');
    await webhook(payment.transactionId!);
    expect((await orderOf(checkout.body.number)).status).toBe('PAID');
  });

  it('valida CPF, dados do cartão e disponibilidade', async () => {
    const { store, product } = await createStore(5);
    expect((await pay(store.slug, product.id, { card })).status).toBe(400);
    expect((await pay(store.slug, product.id, { cpf: '111.111.111-11', card })).status).toBe(400);
    expect((await pay(store.slug, product.id, { cpf })).status).toBe(400);
    expect((await pay(store.slug, product.id, { cpf, card: { ...card, installments: 99 } })).status).toBe(400);
    mercadoPago.publicKey = undefined;
    expect((await pay(store.slug, product.id, { cpf, card })).status).toBe(400);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect(await inventoryOf(product.id)).toMatchObject({ quantity: 5, reserved: 0 });
  });

  it('boleto exige CPF, devolve link e código de barras e é pago pelo webhook', async () => {
    const { store, product } = await createStore(5);
    expect((await pay(store.slug, product.id, {}, 'BOLETO')).status).toBe(400);
    const checkout = await pay(store.slug, product.id, { cpf }, 'BOLETO');
    expect(checkout.status).toBe(201);
    expect(checkout.body.payment.instructions).toMatchObject({ ticketUrl: 'https://mp.test/boleto', barcode: '23790000' });
    expect(mercadoPago.lastRequest).toMatchObject({ method: 'boleto', payer: { cpf: '52998224725', address: { zipCode: '01310-100', state: 'SP' } } });
    const { payments: [payment] } = await orderOf(checkout.body.number);
    mercadoPago.setStatus(payment.transactionId!, 'approved');
    await webhook(payment.transactionId!);
    expect((await orderOf(checkout.body.number)).status).toBe('PAID');
  });
});
