import { NestExpressApplication } from '@nestjs/platform-express';
import { MercadoPagoClient } from '../src/modules/payments/mercado-pago.client';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

const calls: { paymentId: string; amount: number | undefined; key: string }[] = [];
const mp = {
  configured: false, // desligado no checkout (cobrança manual); ligado só quando o teste pede reembolso
  fail: false,
  async ping() { return 'ok' as const; },
  async refund(paymentId: string, amount: number | undefined, key: string) {
    if (mp.fail) throw new Error('Mercado Pago POST falhou com 400: saldo insuficiente');
    calls.push({ paymentId, amount, key });
    return { id: 900 + calls.length };
  },
};

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => ({ app, api } = await startApp(b => b.overrideProvider(MercadoPagoClient).useValue(mp))));
afterAll(() => cleanup(app));
beforeEach(() => { calls.length = 0; mp.fail = false; mp.configured = false; });

async function paidOrder(provider: 'manual' | 'mercadopago') {
  mp.configured = false;
  const { store, product } = await createStore(5);
  const token = await login(api, store, ['orders.write', 'orders.read']);
  const created = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO') });
  if (created.status !== 201) throw new Error(JSON.stringify(created));
  const number = created.body.number as string;
  await api(`/orders/${number}/confirm-payment`, { method: 'POST', token, body: {} });
  await prisma.payment.updateMany({ where: { order: { storeId: store.id, number } }, data: { provider, transactionId: provider === 'mercadopago' ? '42' : undefined } });
  const payment = await prisma.payment.findFirstOrThrow({ where: { order: { storeId: store.id, number } } });
  mp.configured = true;
  return { store, product, token, number, paid: payment.amount.toFixed(2) };
}

describe('reembolso de pedidos', () => {
  it('reembolso manual total devolve o estoque, marca pagamento e pedido e avisa o cliente', async () => {
    const { store, product, token, number, paid } = await paidOrder('manual');
    expect((await inventoryOf(product.id)).quantity).toBe(3);
    const result = await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { reason: 'Cliente desistiu', mode: 'MANUAL' } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ paid, remaining: '0.00', refunds: [{ amount: paid, mode: 'MANUAL', status: 'DONE' }] });
    const order = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number }, include: { payments: true, timeline: true } });
    expect(order.status).toBe('REFUNDED');
    expect(order.payments[0].status).toBe('REFUNDED');
    expect(order.timeline.at(-1)?.message).toContain('Reembolso total');
    expect((await inventoryOf(product.id)).quantity).toBe(5);
    expect(await prisma.outboxEvent.count({ where: { storeId: store.id, eventName: 'orders.order-refunded.v1' } })).toBe(1);
    // nada mais a devolver
    expect((await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { reason: 'de novo', mode: 'MANUAL' } })).status).toBe(409);
  });

  it('reembolsa em partes pelo Mercado Pago, sem passar do pago e com chave de idempotência por reembolso', async () => {
    const { store, token, number, paid } = await paidOrder('mercadopago');
    const total = Number(paid);
    const first = await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { amount: '10,00', reason: 'Item com defeito', mode: 'GATEWAY' } });
    expect(first.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ paymentId: '42', amount: 10 });
    expect((await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number } })).status).toBe('PAID'); // parcial não muda o pedido
    expect(first.body.remaining).toBe((total - 10).toFixed(2));

    expect((await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { amount: String(total), reason: 'passa do restante', mode: 'GATEWAY' } })).status).toBe(400);
    expect(calls).toHaveLength(1);

    const rest = await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { reason: 'Resto', mode: 'GATEWAY' } });
    expect(rest.status).toBe(200);
    expect(calls[1].amount).toBe(total - 10);
    expect(calls[0].key).not.toBe(calls[1].key);
    expect((await prisma.order.findFirstOrThrow({ where: { storeId: store.id, number } })).status).toBe('REFUNDED');
    expect(rest.body.refunds.map((r: { gatewayRefundId: string }) => r.gatewayRefundId).sort()).toEqual(['901', '902']);
  });

  it('falha do gateway não devolve nada, fica registrada e permite tentar de novo', async () => {
    const { token, number, paid } = await paidOrder('mercadopago');
    mp.fail = true;
    const failed = await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { reason: 'Teste', mode: 'GATEWAY' } });
    expect(failed.status).toBe(502);
    const state = await api(`/orders/${number}/refunds`, { token });
    expect(state.body).toMatchObject({ remaining: paid, refunds: [{ status: 'FAILED' }] });
    expect(state.body.refunds[0].error).toContain('saldo insuficiente');
    mp.fail = false;
    expect((await api(`/orders/${number}/refunds`, { method: 'POST', token, body: { reason: 'Teste', mode: 'GATEWAY' } })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('exige permissão, pagamento confirmado e gateway compatível', async () => {
    const manual = await paidOrder('manual');
    const reader = await login(api, manual.store, ['orders.read']);
    expect((await api(`/orders/${manual.number}/refunds`, { method: 'POST', token: reader, body: { reason: 'x y z', mode: 'MANUAL' } })).status).toBe(403);
    expect((await api(`/orders/${manual.number}/refunds`, { method: 'POST', token: manual.token, body: { reason: 'Gateway em pagamento manual', mode: 'GATEWAY' } })).status).toBe(409);
    expect((await api(`/orders/${manual.number}/refunds`, { method: 'POST', token: manual.token, body: { reason: '??', mode: 'MANUAL' } })).status).toBe(400);

    mp.configured = false;
    const { store, product } = await createStore(5);
    const token = await login(api, store, ['orders.write', 'orders.read']);
    const unpaid = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    expect((await api(`/orders/${unpaid.body.number}/refunds`, { method: 'POST', token, body: { reason: 'Não pago', mode: 'MANUAL' } })).status).toBe(409);
    expect((await api(`/orders/${manual.number}/refunds`, { token })).status).toBe(404); // outra loja não enxerga
  });
});
