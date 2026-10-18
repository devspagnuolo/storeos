import { NestExpressApplication } from '@nestjs/platform-express';
import { resolveJwtSecret } from '../src/shared/auth/jwt-secret';
import { encryptSecret } from '../src/shared/auth/totp';
import { createHmac } from 'node:crypto';
import { BlingClient } from '../src/modules/bling/bling.client';
import { BlingWebhookService } from '../src/modules/bling/bling-webhook.service';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

/** Bling falso só com listagem e saldos, no formato da API v3. */
class FakeBling {
  appConfigured = true;
  list: Record<string, unknown>[] = [];
  balances = new Map<number, number>();
  details: Record<number, unknown> = {};
  salesOrders: Record<number, unknown> = {};
  async request(_token: string, path: string) {
    const url = new URL(path, 'https://x.test');
    if (/^\/produtos\/\d+$/.test(url.pathname)) return { data: this.details[Number(url.pathname.split('/')[2])] };
    if (/^\/pedidos\/vendas\/\d+$/.test(url.pathname)) return { data: this.salesOrders[Number(url.pathname.split('/')[3])] };
    if (url.pathname === '/produtos') return { data: url.searchParams.get('pagina') === '1' ? this.list : [] };
    if (url.pathname === '/estoques/saldos') {
      const ids = url.searchParams.getAll('idsProdutos[]').map(Number);
      return { data: ids.filter(id => this.balances.has(id)).map(id => ({ produto: { id }, saldoVirtualTotal: this.balances.get(id) })) };
    }
    throw new Error(`rota inesperada ${path}`);
  }
}

const bling = new FakeBling();
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => { process.env.BLING_CLIENT_SECRET = 'test-secret'; ({ app, api } = await startApp(b => b.overrideProvider(BlingClient).useValue(bling))); });
afterAll(async () => { delete process.env.BLING_CLIENT_SECRET; await cleanup(app); });

const connect = (storeId: string, companyId = '1') => prisma.blingConnection.create({ data: { storeId, companyId, accessTokenEnc: encryptSecret('acc', resolveJwtSecret()), refreshTokenEnc: encryptSecret('ref', resolveJwtSecret()), expiresAt: new Date(Date.now() + 3_600_000) } });

describe('conferência e sincronização de estoque com o Bling', () => {
  it('mostra divergências, copia o saldo do Bling com lançamento no razão e respeita o reservado', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const token = await login(api, store, ['catalog.write', 'settings.write']);
    bling.list = [
      { id: 10, codigo: 'VASO-1', nome: 'Vaso azul', preco: 59.9, formato: 'S', situacao: 'A' },
      { id: 11, codigo: 'NOVO-1', nome: 'Produto novo', preco: 20, formato: 'S', situacao: 'A' },
    ];
    bling.balances = new Map([[10, 12], [11, 3]]);

    const report = await api('/bling/reconciliation', { token });
    expect(report.status).toBe(200);
    expect(report.body.summary).toMatchObject({ matched: 1, onlyInBling: 1, stockDiffs: 1, priceDiffs: 1 });
    expect(report.body.onlyInBling[0].sku).toBe('NOVO-1');
    expect(report.body.stock[0]).toMatchObject({ sku: 'VASO-1', bling: 12, site: 5 });
    expect(report.body.price[0]).toMatchObject({ bling: 59.9, site: 49.9 });

    const sync = await api('/bling/stock-sync', { method: 'POST', token });
    expect(sync.body).toMatchObject({ applied: 1 });
    expect((await inventoryOf(product.id)).quantity).toBe(12);
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { productId: product.id, reason: 'Sincronização Bling' } });
    expect(movement).toMatchObject({ delta: 7, balance: 12, actorId: 'bling' });
    expect((await api('/bling/stock-sync', { method: 'POST', token })).body.applied).toBe(0); // idempotente

    await prisma.inventory.updateMany({ where: { productId: product.id }, data: { reserved: 4 } });
    bling.balances.set(10, 1); // Bling menor que o reservado em pedidos pendentes
    await api('/bling/stock-sync', { method: 'POST', token });
    expect((await inventoryOf(product.id)).quantity).toBe(4);
  });

  it('aviso do Bling atualiza o estoque na hora e produto zerado some da vitrine até voltar a ter saldo', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id, 'cia-tempo-real');
    const token = await login(api, store, ['settings.write']);
    const send = async (event: Record<string, unknown>) => {
      const signature = 'sha256=' + createHmac('sha256', 'test-secret').update(JSON.stringify(event)).digest('hex');
      expect((await api('/bling/webhook', { method: 'POST', body: event, headers: { 'x-bling-signature-256': signature } })).body).toMatchObject({ received: true, ignored: false });
      await app.get(BlingWebhookService).processDue();
    };
    const listed = async () => (await api(`/catalog/products?store=${store.slug}`)).body.items.map((p: { id: string }) => p.id);
    bling.details = { 10: { id: 10, codigo: 'VASO-1', nome: 'Vaso azul', formato: 'S' } };
    expect(await listed()).toContain(product.id);

    // Sincronização desligada: o aviso é aceito, mas nada muda.
    bling.balances = new Map([[10, 0]]);
    await send({ eventId: `stk-0-${store.id}`, event: 'stock.updated', companyId: 'cia-tempo-real', data: { produto: { id: 10 }, saldoVirtualTotal: 0 } });
    expect((await inventoryOf(product.id)).quantity).toBe(5);
    expect((await api('/bling/stock-settings', { method: 'POST', token, body: { enabled: true } })).body.stockSyncEnabled).toBe(true);

    // Venda feita no Bling (aviso de estoque): a loja copia o saldo atual, e com zero o produto sai da vitrine.
    await send({ eventId: `stk-1-${store.id}`, event: 'stock.updated', companyId: 'cia-tempo-real', data: { produto: { id: 10 }, saldoVirtualTotal: 0 } });
    expect((await inventoryOf(product.id)).quantity).toBe(0);
    expect(await listed()).not.toContain(product.id);
    expect((await api(`/catalog/products/${product.slug}?store=${store.slug}`)).status).toBe(404);

    // Pedido de venda criado no Bling (não é do site): os itens dele têm o saldo relido.
    bling.balances.set(10, 3);
    bling.salesOrders = { 777001: { id: 777001, itens: [{ produto: { id: 10 } }] } };
    await send({ eventId: `ord-bling-${store.id}`, event: 'order.updated', companyId: 'cia-tempo-real', data: { id: 777001, numero: 55, situacao: { id: 9 } } });
    expect((await inventoryOf(product.id)).quantity).toBe(3);
    expect(await listed()).toContain(product.id);
    expect((await api(`/catalog/products/${product.slug}?store=${store.slug}`)).status).toBe(200);
  });

  it('não sobrescreve SKU de pedido pago que ainda não chegou ao Bling', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const token = await login(api, store, ['catalog.write', 'settings.write', 'orders.write']);
    bling.list = [{ id: 10, codigo: 'VASO-1', nome: 'Vaso azul', preco: 49.9, formato: 'S', situacao: 'A' }];
    bling.balances = new Map([[10, 9]]);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token, body: {} });
    const sync = await api('/bling/stock-sync', { method: 'POST', token });
    expect(sync.body).toMatchObject({ applied: 0, skippedCount: 1 });
    expect(sync.body.skipped[0].reason).toMatch(/ainda não enviado/);
  });

  it('liga a sincronização automática só com permissão e isola por loja', async () => {
    const { store } = await createStore();
    const other = await createStore();
    await connect(store.id);
    const token = await login(api, store, ['settings.write']);
    const denied = await login(api, store, ['orders.read']);
    expect((await api('/bling/stock-settings', { method: 'POST', token: denied, body: { enabled: true } })).status).toBe(403);
    expect((await api('/bling/stock-settings', { method: 'POST', token, body: { enabled: 'sim' } })).status).toBe(400);
    expect((await api('/bling/stock-settings', { method: 'POST', token, body: { enabled: true } })).body.stockSyncEnabled).toBe(true);
    expect((await api('/bling/status', { token })).body.stockSync.enabled).toBe(true);
    const otherToken = await login(api, other.store, ['settings.write', 'catalog.write']);
    expect((await api('/bling/reconciliation', { token: otherToken })).status).toBeGreaterThanOrEqual(400); // sem conexão
  });
});
