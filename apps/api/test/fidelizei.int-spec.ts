import { NestExpressApplication } from '@nestjs/platform-express';
import { FidelizeiApiError, FidelizeiClient } from '../src/modules/fidelizei/fidelizei.client';
import { FidelizeiSyncService } from '../src/modules/fidelizei/fidelizei-sync.service';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

type Call = { key: string; method: string; path: string; body?: Record<string, unknown>; idempotencyKey?: string };

/** Fidelizei falso, no formato da API pública /storeos (repositório fideliza-plus). */
class FakeFidelizei {
  calls: Call[] = [];
  members = new Map<string, { id: string; cpf: string; balance: number }>();
  rewards = [
    { id: 'rw-10', name: 'R$ 10 de desconto', pointsCost: 100, discountType: 'fixed', discountValue: 1000, minimumOrderCents: 5000 },
    { id: 'rw-15p', name: '15% de desconto', pointsCost: 200, discountType: 'percent', discountValue: 15, minimumOrderCents: 0 },
  ];
  redemptions = new Map<string, { id: string; code: string; customer: string; checkoutId: string; status: string; points: number; rewardId: string }>();
  blingOrders = new Set<string>();
  events: { id: number; eventType: string; entityId: string; externalCustomerId: string; payload: object; createdAt: string }[] = [];
  next = 1;

  private fail(status: number, message: string, code?: string): never { throw new FidelizeiApiError(status, message, code); }

  async request<T>(key: string, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const method = init.method ?? 'GET';
    const body = init.body as Record<string, any> | undefined;
    this.calls.push({ key, method, path, body, idempotencyKey: init.idempotencyKey });
    if (key === 'fz_live_revogada123') this.fail(401, 'Chave de API inválida.');
    const url = new URL(path, 'https://x.test');
    if (url.pathname === '/storeos/events') {
      const after = Number(url.searchParams.get('after'));
      const data = this.events.filter(e => e.id > after);
      return { data, nextCursor: data.at(-1)?.id ?? after, hasMore: false } as T;
    }
    if (method === 'POST' && !init.idempotencyKey && !path.endsWith('/validate')) this.fail(400, 'Envie Idempotency-Key');
    if (url.pathname === '/storeos/customers/enroll') {
      if (!body!.programConsent) this.fail(422, 'É necessário consentimento explícito para adesão ao programa de fidelidade.', 'LOYALTY_CONSENT_REQUIRED');
      const member = this.members.get(body!.externalCustomerId) ?? { id: `fz-${this.next++}`, cpf: body!.cpf, balance: 250 };
      this.members.set(body!.externalCustomerId, member);
      return { data: { id: member.id, pointsBalance: member.balance, enrolledAt: '2026-10-17T10:00:00Z', eligibleForPoints: true } } as T;
    }
    const loyalty = /^\/storeos\/customers\/([^/]+)\/loyalty$/.exec(url.pathname);
    if (loyalty) {
      const member = this.members.get(decodeURIComponent(loyalty[1])) ?? this.fail(404, 'Cliente Fidelizei não localizado ou sem adesão ativa.');
      return { data: { customer: { pointsBalance: member.balance, enrolledAt: '2026-10-17T10:00:00Z' }, tierRank: 0, rewards: this.rewards.map(r => ({ ...r, canRedeem: member.balance >= r.pointsCost })) } } as T;
    }
    if (url.pathname === '/storeos/redemptions') {
      const member = this.members.get(body!.externalCustomerId) ?? this.fail(404, 'Cliente não está vinculado.', 'CUSTOMER_NOT_ENROLLED');
      const reward = this.rewards.find(r => r.id === body!.rewardId) ?? this.fail(404, 'Benefício indisponível.', 'REWARD_NOT_AVAILABLE');
      if (member.balance < reward.pointsCost) this.fail(409, 'Saldo de pontos insuficiente.', 'INSUFFICIENT_POINTS');
      member.balance -= reward.pointsCost;
      const id = `00000000-0000-4000-8000-${String(this.next++).padStart(12, '0')}`;
      const code = `FZ-CODE${String(this.next).padStart(5, '0')}`;
      this.redemptions.set(id, { id, code, customer: body!.externalCustomerId, checkoutId: body!.checkoutId, status: 'ready_for_use', points: reward.pointsCost, rewardId: reward.id });
      return { data: { id, code, status: 'reserved', checkoutId: body!.checkoutId, pointsDebited: reward.pointsCost, reservationExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), discount: { type: reward.discountType, value: reward.discountValue, minimumOrderCents: reward.minimumOrderCents } } } as T;
    }
    if (url.pathname === '/storeos/coupons/validate') {
      const row = [...this.redemptions.values()].find(r => r.code === body!.code && r.customer === body!.externalCustomerId) ?? this.fail(404, 'Cupom não encontrado para esta cliente.');
      if (row.status !== 'ready_for_use') this.fail(409, 'Cupom não está disponível.', 'COUPON_NOT_AVAILABLE');
      if (row.checkoutId !== body!.checkoutId) this.fail(409, 'Cupom reservado para outro checkout.', 'CHECKOUT_MISMATCH');
      const reward = this.rewards.find(r => r.id === row.rewardId)!;
      if (body!.subtotalCents < reward.minimumOrderCents) this.fail(409, 'Subtotal mínimo não atingido.', 'MINIMUM_ORDER_NOT_MET');
      return { data: { redemptionId: row.id, code: row.code, checkoutId: row.checkoutId, status: 'valid', discount: { type: reward.discountType, value: reward.discountValue, minimumOrderCents: reward.minimumOrderCents } } } as T;
    }
    const action = /^\/storeos\/redemptions\/([^/]+)\/(confirm|cancel)$/.exec(url.pathname);
    if (action) {
      const row = this.redemptions.get(action[1]) ?? this.fail(404, 'Resgate não encontrado.', 'REDEMPTION_NOT_FOUND');
      if (action[2] === 'confirm') {
        if (!this.blingOrders.has(body!.blingOrderNumber)) this.fail(409, 'O pedido confirmado não foi encontrado no Bling.', 'BLING_ORDER_NOT_CONFIRMED');
        row.status = 'used';
        return { data: { id: row.id, status: 'used' } } as T;
      }
      if (row.status === 'used' && body!.reason !== 'order_cancelled') this.fail(409, 'Estorno exige Bling.', 'BLING_REVERSAL_REQUIRED');
      row.status = 'cancelled';
      [...this.members.values()].find((_, i) => [...this.members.keys()][i] === row.customer)!.balance += row.points;
      return { data: { id: row.id, status: 'cancelled', pointsRestored: row.points } } as T;
    }
    throw new Error(`rota inesperada ${method} ${path}`);
  }
}

const fz = new FakeFidelizei();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
const sent: { to: string; text: string }[] = [];

beforeAll(async () => {
  ({ app, api } = await startApp(b => b.overrideProvider(FidelizeiClient).useValue(fz).overrideProvider(MAIL_PROVIDER).useValue({ send: async (m: { to: string; text: string }) => { sent.push(m); return { status: 'SIMULATED' }; } })));
});
afterAll(() => cleanup(app));

async function signIn(storeSlug: string, email: string, name: string) {
  await api('/account/login/request', { method: 'POST', body: { storeSlug, email, name } });
  const code = sent.filter(m => m.to === email).at(-1)!.text.match(/\b(\d{6})\b/)![1];
  return (await api('/account/login/verify', { method: 'POST', body: { storeSlug, email, code, name } })).body.token as string;
}

async function connectedStore() {
  const created = await createStore(10);
  const admin = await login(api, created.store, ['settings.write', 'orders.read']);
  expect((await api('/fidelizei/settings', { method: 'PUT', token: admin, body: { apiKey: 'fz_live_chave-da-vivi-1234', termsUrl: 'https://vivi.test/termos' } })).status).toBe(200);
  return { ...created, admin };
}

describe('Fidelizei no painel', () => {
  it('guarda a chave criptografada, mostra só o final e acusa chave recusada', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    expect((await api('/fidelizei/settings', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
    expect((await api('/fidelizei/settings', { method: 'PUT', token: admin, body: {} })).status).toBe(400);
    expect((await api('/fidelizei/settings', { method: 'PUT', token: admin, body: { apiKey: 'chave errada' } })).status).toBe(400);

    const saved = await api('/fidelizei/settings', { method: 'PUT', token: admin, body: { apiKey: 'fz_live_chave-da-vivi-1234' } });
    expect(saved.body).toMatchObject({ connected: true, enabled: true, keyHint: 'fz_live_…1234', lastError: null, termsVersion: '2026-10' });
    expect(saved.body.checkedAt).toBeTruthy();
    const row = await prisma.fidelizeiConnection.findUniqueOrThrow({ where: { storeId: store.id } });
    expect(row.apiKeyEnc).not.toContain('chave-da-vivi');
    expect(JSON.stringify(saved.body)).not.toContain('chave-da-vivi');

    const revoked = await api('/fidelizei/settings', { method: 'PUT', token: admin, body: { apiKey: 'fz_live_revogada123' } });
    expect(revoked.body.lastError).toContain('recusou a chave');
    expect((await api('/fidelizei/connection', { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api('/fidelizei/settings', { token: admin })).body.connected).toBe(false);
  });
});

describe('Fidelizei na área da cliente e no checkout', () => {
  it('adesão com consentimento, saldo, benefício como desconto no pedido e confirmação depois do Bling', async () => {
    const { store, product, admin } = await connectedStore();
    const token = await signIn(store.slug, 'maria@example.com', 'Maria Silva');
    const headers = { 'x-customer-token': token };
    expect((await api('/account/fidelizei')).status).toBe(401);
    expect((await api('/account/fidelizei', { headers })).body).toMatchObject({ enabled: true, enrolled: false, termsUrl: 'https://vivi.test/termos', hasDocument: false });

    expect((await api('/account/fidelizei/enroll', { method: 'POST', headers, body: { cpf: '529.982.247-25', consent: false } })).status).toBe(400);
    expect((await api('/account/fidelizei/enroll', { method: 'POST', headers, body: { cpf: '123', consent: true } })).status).toBe(400);
    const enrolled = await api('/account/fidelizei/enroll', { method: 'POST', headers, body: { cpf: '529.982.247-25', consent: true } });
    expect(enrolled.body).toMatchObject({ enrolled: true, balance: 250 });
    expect(enrolled.body.rewards).toHaveLength(2);
    const enrollCall = fz.calls.find(c => c.path === '/storeos/customers/enroll')!;
    expect(enrollCall.body).toMatchObject({ cpf: '52998224725', programConsent: true, termsVersion: '2026-10', privacyVersion: '2026-10', email: 'maria@example.com' });
    expect(enrollCall.idempotencyKey).toMatch(/^storeos-enroll-/);
    const customer = await prisma.customer.findFirstOrThrow({ where: { storeId: store.id, email: 'maria@example.com' } });
    expect(customer.document).toBe('52998224725');

    // Reserva R$ 10 (100 pontos) e fecha o pedido com Pix.
    const reserved = await api('/account/fidelizei/reserve', { method: 'POST', headers, body: { rewardId: 'rw-10', subtotal: 99.8 } });
    expect(reserved.status).toBe(200);
    expect(reserved.body).toMatchObject({ rewardName: 'R$ 10 de desconto', pointsDebited: 100, balance: 150 });
    const loyaltyReward = { checkoutId: reserved.body.checkoutId, code: reserved.body.code };
    const body = { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'PIX'), loyaltyReward };
    expect((await api('/checkout', { method: 'POST', body: { ...body, paymentMethod: 'BOLETO' } })).status).toBe(400);
    expect((await api('/checkout', { method: 'POST', body: { ...body, couponCode: 'QUALQUER' } })).status).toBe(400);
    expect((await api('/checkout', { method: 'POST', body: { ...body, customer: { name: 'Outra', email: 'outra@example.com' } } })).status).toBe(400);
    const order = await api('/checkout', { method: 'POST', body });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ subtotal: '99.80', discount: '10.00', total: '89.80', couponCode: reserved.body.code });
    // O mesmo benefício não vale para um segundo pedido.
    expect((await api('/checkout', { method: 'POST', body })).body.code).toBe('FIDELIZEI_EXPIRED');

    const saved = await prisma.order.findFirstOrThrow({ where: { number: order.body.number }, include: { fidelizeiRedemption: true } });
    expect(saved.fidelizeiRedemption).toMatchObject({ status: 'RESERVED', discountType: 'fixed' });
    expect(saved.fidelizeiRedemption!.discountAmount!.toFixed(2)).toBe('10.00');

    // Pago e enviado ao Bling: confirma no Fidelizei. Antes da conciliação lá, espera e tenta de novo.
    await app.get(OrderLifecycleService).markPaid({ orderId: saved.id });
    await prisma.blingOrderSync.create({ data: { storeId: store.id, orderId: saved.id, status: 'SENT', blingOrderId: '9001', blingOrderNumber: '26100', sentAt: new Date() } });
    const sync = app.get(FidelizeiSyncService);
    await sync.processDue();
    let row = await prisma.fidelizeiRedemption.findUniqueOrThrow({ where: { orderId: saved.id } });
    expect(row).toMatchObject({ status: 'RESERVED', attempts: 1 });
    expect(row.lastError).toContain('não foi encontrado no Bling');
    fz.blingOrders.add('26100');
    await prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
    expect(await sync.processDue()).toBe(1);
    row = await prisma.fidelizeiRedemption.findUniqueOrThrow({ where: { orderId: saved.id } });
    expect(row).toMatchObject({ status: 'CONFIRMED', lastError: null });
    expect(fz.calls.filter(c => c.path.endsWith('/confirm')).at(-1)!.body).toEqual({ checkoutId: row.checkoutId, blingOrderId: '9001', blingOrderNumber: '26100' });

    const list = await api('/fidelizei/redemptions', { token: admin });
    expect(list.body[0]).toMatchObject({ orderNumber: order.body.number, reward: 'R$ 10 de desconto', status: 'CONFIRMED', discount: '10.00' });
  });

  it('desistir devolve os pontos; pedido cancelado antes do Bling estorna a reserva', async () => {
    const { store, product } = await connectedStore();
    const token = await signIn(store.slug, 'ana@example.com', 'Ana Souza');
    const headers = { 'x-customer-token': token };
    await api('/account/fidelizei/enroll', { method: 'POST', headers, body: { cpf: '111.444.777-35', consent: true } });
    const customer = await prisma.customer.findFirstOrThrow({ where: { storeId: store.id, email: 'ana@example.com' } });

    const first = await api('/account/fidelizei/reserve', { method: 'POST', headers, body: { rewardId: 'rw-15p', subtotal: 49.9 } });
    expect((await api('/account/fidelizei/release', { method: 'POST', headers, body: { checkoutId: first.body.checkoutId } })).body).toEqual({ released: true });
    expect(fz.members.get(customer.id)!.balance).toBe(250);
    expect((await api('/account/fidelizei/reserve', { method: 'POST', headers, body: { rewardId: 'nao-existe', subtotal: 10 } })).status).toBe(400);

    const reserved = await api('/account/fidelizei/reserve', { method: 'POST', headers, body: { rewardId: 'rw-15p', subtotal: 49.9 } });
    const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'PIX'), customer: { name: 'Ana Souza', email: 'ana@example.com' }, cpf: '111.444.777-35', loyaltyReward: { checkoutId: reserved.body.checkoutId, code: reserved.body.code } } });
    expect(order.body).toMatchObject({ discount: '7.49', total: '42.41' });
    expect(fz.members.get(customer.id)!.balance).toBe(50);

    await app.get(OrderLifecycleService).cancel({ storeId: store.id, number: order.body.number }, { message: 'Pix vencido' });
    expect(await app.get(FidelizeiSyncService).processDue()).toBe(1);
    expect((await prisma.fidelizeiRedemption.findUniqueOrThrow({ where: { checkoutId: reserved.body.checkoutId } })).status).toBe('CANCELLED');
    expect(fz.calls.filter(c => c.path.endsWith('/cancel')).at(-1)!.body).toEqual({ checkoutId: reserved.body.checkoutId, reason: 'checkout_failed' });
    expect(fz.members.get(customer.id)!.balance).toBe(250);
  });

  it('a fila de eventos marca reservas vencidas e a loja sem Fidelizei não oferece o programa', async () => {
    const { store } = await createStore();
    const token = await signIn(store.slug, 'bia@example.com', 'Bia Lima');
    expect((await api('/account/fidelizei', { headers: { 'x-customer-token': token } })).body).toEqual({ enabled: false });

    const { store: other } = await connectedStore();
    const customer = await prisma.customer.create({ data: { storeId: other.id, email: 'cli@example.com', name: 'Cli' } });
    const row = await prisma.fidelizeiRedemption.create({ data: { storeId: other.id, customerId: customer.id, redemptionId: 'evt-redemption-1', checkoutId: 'storeos-evt-1', code: 'FZ-EVT0000001', rewardId: 'rw-10', rewardName: 'R$ 10', pointsDebited: 100, discountType: 'fixed', discountValue: 1000, reservationExpiresAt: new Date(Date.now() + 600_000) } });
    fz.events.push({ id: 7, eventType: 'redemption.expired', entityId: 'evt-redemption-1', externalCustomerId: customer.id, payload: {}, createdAt: new Date().toISOString() });
    await app.get(FidelizeiSyncService).readEvents();
    expect((await prisma.fidelizeiRedemption.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('EXPIRED');
    expect((await prisma.fidelizeiConnection.findUniqueOrThrow({ where: { storeId: other.id } })).eventsCursor).toBe(7);
  });
});
