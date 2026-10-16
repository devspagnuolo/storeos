import { NestExpressApplication } from '@nestjs/platform-express';
import { FulfillmentAutomationService } from '../src/modules/fulfillment/fulfillment-automation.service';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';
import { money } from '../src/shared/money/money';
import { SuperFreteClient, SuperFreteLabelInput } from '../src/modules/shipping/superfrete.client';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

/** SuperFrete falso: etiqueta nasce "pending", vira "released" com rastreio depois de paga e "delivered" quando o teste manda. */
class FakeSuperFrete {
  enabled = true;
  provider = 'superfrete';
  created: SuperFreteLabelInput[] = [];
  paid: string[] = [];
  failPay = false;
  statuses = new Map<string, string>();
  async quote() { return [{ id: 'sf:2', name: 'Correios SEDEX', price: money('25.00'), minDays: 2, maxDays: 4 }]; }
  async createLabel(input: SuperFreteLabelInput) { this.created.push(input); const id = `sf-${this.created.length}`; this.statuses.set(id, 'pending'); return { id, price: 18.5 }; }
  async payLabel(id: string) { if (this.failPay) throw new Error('SuperFrete respondeu 400: Saldo insuficiente'); this.paid.push(id); this.statuses.set(id, 'released'); }
  async labelInfo(id: string) { const status = this.statuses.get(id) ?? 'pending'; return { status, tracking: status === 'pending' ? null : 'QB123456789BR', price: 18.5 }; }
  async printUrl(id: string) { return `https://etiquetas.test/${id}.pdf`; }
}

const SENDER = { name: 'Vivi Moda', document: '11.222.333/0001-81', street: 'Rua das Flores', number: '10', district: 'Centro', city: 'São Paulo', state: 'SP' };

describe('Automação do pedido pago até a entrega', () => {
  let app: NestExpressApplication;
  let api: Awaited<ReturnType<typeof startApp>>['api'];
  const superFrete = new FakeSuperFrete();

  beforeAll(async () => {
    ({ app, api } = await startApp(b => b.overrideProvider(SuperFreteClient).useValue(superFrete)));
  });
  afterAll(() => cleanup(app));

  async function paidOrder(automation: boolean) {
    const { store, product } = await createStore();
    await prisma.store.update({ where: { id: store.id }, data: { orderAutomation: automation, shippingOriginZip: '01310100', shippingSender: SENDER } });
    const created = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }]), shippingRuleId: 'sf:2' } });
    const order = await prisma.order.findUniqueOrThrow({ where: { storeId_number: { storeId: store.id, number: created.body.number } } });
    expect(order).toMatchObject({ shippingOptionId: 'sf:2', shippingMethod: 'Correios SEDEX' });
    await app.get(OrderLifecycleService).markPaid({ orderId: order.id });
    return { store, order };
  }
  const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  it('separa, fatura, compra a etiqueta, avisa a cliente e marca entregue', async () => {
    const { store, order } = await paidOrder(true);
    const automation = app.get(FulfillmentAutomationService);

    await automation.run();
    expect(await statusOf(order.id)).toBe('PICKING');

    // Nota autorizada pelo Bling (fora deste teste) grava o número no pedido; a automação leva a "faturado" e compra a etiqueta.
    await prisma.fulfillment.update({ where: { orderId: order.id }, data: { invoiceNumber: '000123', invoiceKey: '3'.repeat(44) } });
    await automation.run();
    expect(await statusOf(order.id)).toBe('SHIPPED');
    const input = superFrete.created.at(-1)!;
    expect(input).toMatchObject({ service: 2, tag: order.number, from: { postal_code: '01310100', document: '11222333000181', state_abbr: 'SP' }, to: { postal_code: '01310100', name: 'Maria Silva', document: '52998224725' }, options: { non_commercial: false, invoice: { number: '000123' } } });
    expect(input.volumes).toMatchObject({ weight: 0.6, height: 10 });
    const fulfillment = await prisma.fulfillment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(fulfillment).toMatchObject({ carrier: 'Correios', trackingCode: 'QB123456789BR' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, eventName: 'orders.order-shipped.v1' } })).toBe(1);
    const label = await prisma.shippingLabel.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(label).toMatchObject({ status: 'RELEASED', labelUrl: expect.stringContaining('.pdf') });

    // Rodar de novo não compra outra etiqueta.
    await automation.run();
    expect(superFrete.paid.filter(id => id === label.remoteId)).toHaveLength(1);

    superFrete.statuses.set(label.remoteId!, 'delivered');
    await prisma.shippingLabel.update({ where: { id: label.id }, data: { nextAttemptAt: new Date() } });
    await automation.run();
    expect(await statusOf(order.id)).toBe('DELIVERED');
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, eventName: 'orders.order-delivered.v1' } })).toBe(1);

    const admin = await login(api, store, ['orders.read']);
    const detail = await api(`/orders/${order.number}`, { token: admin });
    expect(detail.body.shippingLabel).toMatchObject({ status: 'DELIVERED', trackingCode: 'QB123456789BR' });
  });

  it('não mexe em pedidos de lojas com a automação desligada', async () => {
    const { order } = await paidOrder(false);
    await app.get(FulfillmentAutomationService).run();
    expect(await statusOf(order.id)).toBe('PAID');
  });

  it('erro de saldo fica registrado e o painel pode tentar de novo sem lançar outra etiqueta', async () => {
    const { store, order } = await paidOrder(true);
    const automation = app.get(FulfillmentAutomationService);
    await automation.run();
    await prisma.fulfillment.update({ where: { orderId: order.id }, data: { invoiceNumber: '000124' } });
    superFrete.failPay = true;
    const before = superFrete.created.length;
    await automation.run();
    expect(await statusOf(order.id)).toBe('INVOICED');
    const failed = await prisma.shippingLabel.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1, lastError: expect.stringContaining('Saldo insuficiente') });
    expect(superFrete.created.at(-1)!.options).toMatchObject({ non_commercial: true });

    superFrete.failPay = false;
    const admin = await login(api, store, ['orders.write']);
    const retried = await api(`/orders/${order.number}/label`, { method: 'POST', token: admin });
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ status: 'RELEASED', trackingCode: 'QB123456789BR' });
    expect(superFrete.created.length).toBe(before + 1);
    expect(await statusOf(order.id)).toBe('SHIPPED');
  });

  it('sem remetente cadastrado, avisa o que falta', async () => {
    const { store, order } = await paidOrder(true);
    await prisma.store.update({ where: { id: store.id }, data: { shippingSender: { name: 'Vivi' } } });
    const automation = app.get(FulfillmentAutomationService);
    await automation.run();
    await prisma.fulfillment.update({ where: { orderId: order.id }, data: { invoiceNumber: '000125' } });
    await automation.run();
    const label = await prisma.shippingLabel.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(label.lastError).toContain('CPF ou CNPJ do remetente');
    expect(label.remoteId).toBeNull();

    const admin = await login(api, store, ['settings.write']);
    const saved = await api('/fulfillment/automation', { method: 'PUT', token: admin, body: { enabled: true, sender: SENDER } });
    expect(saved.body).toMatchObject({ enabled: true, missing: [], superFrete: true });
  });
});
