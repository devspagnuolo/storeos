import { NestExpressApplication } from '@nestjs/platform-express';
import { resolveJwtSecret } from '../src/shared/auth/jwt-secret';
import { encryptSecret } from '../src/shared/auth/totp';
import { BlingClient } from '../src/modules/bling/bling.client';
import { checkoutBody, cleanup, createStore, inventoryOf, login, prisma, startApp } from './helpers';

/** Bling falso só com listagem e saldos, no formato da API v3. */
class FakeBling {
  appConfigured = true;
  list: Record<string, unknown>[] = [];
  balances = new Map<number, number>();
  async request(_token: string, path: string) {
    const url = new URL(path, 'https://x.test');
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
beforeAll(async () => ({ app, api } = await startApp(b => b.overrideProvider(BlingClient).useValue(bling))));
afterAll(() => cleanup(app));

const connect = (storeId: string) => prisma.blingConnection.create({ data: { storeId, companyId: '1', accessTokenEnc: encryptSecret('acc', resolveJwtSecret()), refreshTokenEnc: encryptSecret('ref', resolveJwtSecret()), expiresAt: new Date(Date.now() + 3_600_000) } });

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
