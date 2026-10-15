import { NestExpressApplication } from '@nestjs/platform-express';
import { AutomationsService } from '../src/modules/automations/automations.service';
import { MAIL_PROVIDER, MailProvider, OutgoingMail } from '../src/modules/notifications/mail-provider';
import { OutboxDispatcher } from '../src/modules/notifications/outbox-dispatcher';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

class FakeMail implements MailProvider {
  sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail) { this.sent.push(mail); return { status: 'SENT' as const, providerId: 'm1' }; }
}
const fake = new FakeMail();
// Os e-mails do pedido (transacionais) também passam pelo provedor; as automações são os que levam o cabeçalho de descadastro.
const sentByAutomation = () => fake.sent.filter(m => m.headers?.['List-Unsubscribe']);
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  ({ app, api } = await startApp(b => b.overrideProvider(MAIL_PROVIDER).useValue(fake)));
});
afterAll(() => cleanup(app));

describe('automações', () => {
  it('valida, dispara por evento, respeita espera, primeira compra, autorização e não repete', async () => {
    const { store, product } = await createStore(20);
    const other = await createStore();
    const admin = await login(api, store, ['marketing.write', 'orders.write', 'orders.read']);
    const service = app.get(AutomationsService);
    const dispatcher = app.get(OutboxDispatcher);
    await dispatcher.dispatchOnce(); // limpa eventos de outros testes

    // permissão e validação
    expect((await api('/automations', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
    const bad = await api('/automations', { method: 'POST', token: admin, body: { name: 'Sem ação', trigger: 'orders.order-paid.v1', actions: [] } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('pelo menos uma ação');
    expect((await api('/automations', { method: 'POST', token: admin, body: { name: 'Gatilho ruim', trigger: 'nada', actions: [{ type: 'ADD_TAG', tag: 'x' }] } })).status).toBe(400);

    // modelos prontos nascem desligados
    const presets = await api('/automations/presets', { token: admin });
    expect(presets.body.map((p: { key: string }) => p.key)).toContain('agradecimento-cupom');
    const thanks = await api('/automations/presets/agradecimento-cupom', { method: 'POST', token: admin });
    expect(thanks.status).toBe(201);
    expect(thanks.body).toMatchObject({ active: false, delayMinutes: 60, triggerLabel: 'Pedido pago' });
    expect((await api('/automations/presets/nao-existe', { method: 'POST', token: admin })).status).toBe(404);
    const big = await api('/automations', { method: 'POST', token: admin, body: { name: 'Compras grandes', trigger: 'orders.order-paid.v1', conditions: { minTotal: 100 }, actions: [{ type: 'ADD_TAG', tag: 'Compra Grande' }, { type: 'ADD_POINTS', points: 50 }], active: true } });
    expect(big.status).toBe(201);
    await api(`/automations/${thanks.body.id}`, { method: 'PATCH', token: admin, body: { active: true } });

    const buy = async (quantity: number) => {
      const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity }], 'BOLETO') });
      await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
      await dispatcher.dispatchOnce();
      return order.body.number as string;
    };
    const customer = async () => prisma.customer.findFirstOrThrow({ where: { storeId: store.id } });

    // primeira compra, R$ 149,70: as duas regras entram na fila; a de agradecimento espera 60 minutos
    const first = await buy(3);
    const runs = await prisma.automationRun.findMany({ where: { storeId: store.id }, include: { rule: true } });
    expect(runs.map(r => r.rule.name).sort()).toEqual(['Agradecimento + cupom na primeira compra', 'Compras grandes']);
    expect(await service.processDue()).toBe(1); // só a que não tem espera
    const c1 = await customer();
    expect(c1.tags).toEqual(['compra-grande']);
    expect(await prisma.loyaltyEntry.count({ where: { customerId: c1.id, type: 'ADJUST', points: 50 } })).toBe(1);

    // venceu a espera, mas o cliente ainda não autorizou comunicações: cupom é criado, e-mail não sai
    await prisma.automationRun.updateMany({ where: { storeId: store.id }, data: { runAt: new Date(Date.now() - 1000) } });
    expect(await service.processDue()).toBe(1);
    expect(sentByAutomation()).toHaveLength(0);
    const skipped = await prisma.automationRun.findFirstOrThrow({ where: { storeId: store.id, rule: { name: { startsWith: 'Agradecimento' } } } });
    expect(skipped.status).toBe('DONE');
    expect(skipped.result).toContain('não autorizou');
    const coupons = await prisma.coupon.findMany({ where: { storeId: store.id } });
    expect(coupons).toHaveLength(1);
    expect(coupons[0]).toMatchObject({ type: 'PERCENT', maxUses: 1, oncePerCustomer: true });
    expect(coupons[0].code).toMatch(/^OBRIGADO-[A-Z0-9]{6}$/);

    // segunda compra: "primeira compra" não vale mais; e-mail só com autorização
    await buy(1);
    expect(await prisma.automationRun.count({ where: { storeId: store.id, rule: { name: { startsWith: 'Agradecimento' } } } })).toBe(1);

    // reprocessar o mesmo evento não duplica
    await prisma.outboxEvent.updateMany({ where: { storeId: store.id }, data: { publishedAt: null, attempts: 0 } });
    await dispatcher.dispatchOnce();
    expect(await prisma.automationRun.count({ where: { storeId: store.id } })).toBe(2); // a segunda compra não casa com nenhuma regra e o reprocessamento não duplica

    // novo cliente que autorizou: recebe o e-mail com o cupom e o link de descadastro
    await prisma.customer.update({ where: { id: c1.id }, data: { marketingOptIn: true, email: 'nova@example.com' } });
    const second = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), customer: { name: 'Joana Lima', email: 'joana@example.com' } } });
    await prisma.customer.updateMany({ where: { storeId: store.id, email: 'joana@example.com' }, data: { marketingOptIn: true } });
    await api(`/orders/${second.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    await dispatcher.dispatchOnce();
    await prisma.automationRun.updateMany({ where: { storeId: store.id, status: 'PENDING' }, data: { runAt: new Date(Date.now() - 1000) } });
    await service.processDue();
    const mails = sentByAutomation();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('joana@example.com');
    expect(mails[0].subject).toContain('Obrigada pela compra, Joana!');
    expect(mails[0].text).toMatch(/OBRIGADO-[A-Z0-9]{6}/);
    expect(mails[0].text).toContain(second.body.number);
    expect(mails[0].text).toContain('https://loja.example.com/descadastro/');
    expect(await prisma.emailLog.count({ where: { storeId: store.id, template: 'automation' } })).toBe(1);

    // cliente que se descadastrou nunca recebe
    await prisma.newsletterSubscriber.create({ data: { storeId: store.id, email: 'joana@example.com', unsubscribedAt: new Date() } });
    const run = await prisma.automationRun.findFirstOrThrow({ where: { storeId: store.id, status: 'DONE', result: { contains: 'e-mail enviado' } } });
    await prisma.automationRun.update({ where: { id: run.id }, data: { status: 'PENDING', state: { done: 1 }, runAt: new Date(Date.now() - 1000) } });
    fake.sent.length = 0;
    await service.processDue();
    expect(sentByAutomation()).toHaveLength(0);

    // listagem, histórico e isolamento
    const list = await api('/automations', { token: admin });
    expect(list.body).toHaveLength(2);
    expect(list.body.find((r: { name: string }) => r.name === 'Compras grandes').runs.DONE).toBeGreaterThanOrEqual(1);
    const history = await api('/automations/runs', { token: admin });
    expect(history.body[0]).toMatchObject({ rule: expect.any(String), status: expect.any(String) });
    const foreign = await login(api, other.store, ['marketing.write']);
    expect((await api('/automations', { token: foreign })).body).toEqual([]);
    expect((await api(`/automations/${big.body.id}`, { method: 'PATCH', token: foreign, body: { active: false } })).status).toBe(404);
    expect((await api(`/automations/${big.body.id}`, { method: 'DELETE', token: foreign })).status).toBe(404);

    // pedido cancelado antes da execução: ação pulada
    const third = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${third.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    await dispatcher.dispatchOnce();
    await prisma.order.updateMany({ where: { number: third.body.number }, data: { status: 'CANCELLED' } });
    await prisma.automationRun.updateMany({ where: { storeId: store.id, status: 'PENDING' }, data: { runAt: new Date(Date.now() - 1000) } });
    await service.processDue();
    expect(await prisma.automationRun.count({ where: { storeId: store.id, status: 'SKIPPED' } })).toBeGreaterThanOrEqual(1);

    expect((await api(`/automations/${big.body.id}`, { method: 'DELETE', token: admin })).status).toBe(200);
    expect(first).toBeTruthy();
  });
});
