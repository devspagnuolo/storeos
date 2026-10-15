import { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { resolveJwtSecret } from '../src/shared/auth/jwt-secret';
import { encryptSecret } from '../src/shared/auth/totp';
import { makeState } from '../src/modules/bling/bling-auth.service';
import { BlingOrdersService } from '../src/modules/bling/bling-orders.service';
import { BlingInvoicesService } from '../src/modules/bling/bling-invoices.service';
import { BlingWebhookService } from '../src/modules/bling/bling-webhook.service';
import { BlingClient } from '../src/modules/bling/bling.client';
import { RemoteImageService } from '../src/modules/media/remote-image.service';
import { OrderLifecycleService } from '../src/modules/orders/order-lifecycle.service';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

/** Bling falso: responde às rotas que a integração usa e guarda o que recebeu. */
class FakeBling {
  appConfigured = true;
  calls: { method: string; path: string; body?: unknown }[] = [];
  failOrders = false;
  salesOrders = new Map<string, number>();
  invoiceCalls: { method: string; path: string; body?: unknown }[] = [];
  nextId = 9000;
  products: Record<number, unknown> = {
    1: { id: 1, nome: 'Blusa de Renda', codigo: 'BR-1', preco: 99.9, situacao: 'A', formato: 'V', descricaoComplementar: '<p>Linda blusa</p>', categoria: { id: 3 }, midia: { imagens: { externas: [{ link: 'https://cdn.test/br.jpg' }] } }, variacoes: [{ id: 11, codigo: 'BR-1-P', preco: 99.9, variacao: { nome: 'Tamanho:P' }, estoque: { saldoVirtualTotal: 4 } }, { id: 12, codigo: 'BR-1-G', preco: 109.9, variacao: { nome: 'Tamanho:G' }, estoque: { saldoVirtualTotal: 2 } }] },
    2: { id: 2, nome: 'Calça Pantalona', codigo: 'CP-1', preco: 150, situacao: 'A', formato: 'S', estoque: { saldoVirtualTotal: 7 } },
    3: { id: 3, nome: 'Sem código', preco: 10, situacao: 'A' },
  };

  authorizeUrl(state: string) { return `https://bling.test/authorize?state=${state}`; }
  async token(body: Record<string, string>) { return { access_token: `acc-${body.grant_type}`, refresh_token: 'ref', expires_in: 21600 }; }

  async request(_token: string, path: string, init: { method?: string; body?: unknown } = {}) {
    const method = init.method ?? 'GET';
    this.calls.push({ method, path, body: init.body });
    const url = new URL(path, 'https://x.test');
    if (url.pathname === '/empresas/me/dados-basicos') return { data: { id: 777 } };
    if (url.pathname.startsWith('/situacoes/')) return { data: { id: 42, nome: 'Em aberto' } };
    if (url.pathname === '/categorias/produtos') return { data: [{ id: 1, descricao: 'Blusas' }, { id: 2, descricao: 'Manga Longa', categoriaPai: { id: 1 } }, { id: 3, descricao: 'Renda', categoriaPai: { id: 2 } }] };
    if (url.pathname === '/produtos' && url.searchParams.has('criterio')) {
      const q = url.searchParams.get('nome')?.toLowerCase();
      return { data: Object.values(this.products as Record<number, { id: number; nome: string; codigo?: string; preco?: number; situacao?: string; formato?: string; estoque?: { saldoVirtualTotal?: number } }>)
        .filter(p => !q || p.nome.toLowerCase().includes(q)).map(p => ({ id: p.id, nome: p.nome, codigo: p.codigo, preco: p.preco, situacao: p.situacao, formato: p.formato, imagemURL: 'https://cdn.test/capa.jpg', estoque: p.estoque })) };
    }
    if (url.pathname === '/estoques/saldos') return { data: url.searchParams.getAll('idsProdutos[]').map(id => ({ produto: { id: Number(id) }, saldoVirtualTotal: (this.products[Number(id)] as { estoque?: { saldoVirtualTotal?: number } })?.estoque?.saldoVirtualTotal ?? 0 })) };
    if (url.pathname === '/produtos' && url.searchParams.has('codigos[]')) return { data: [{ id: 555, codigo: 'VASO-1' }] };
    if (url.pathname.startsWith('/produtos/')) return { data: this.products[Number(url.pathname.split('/')[2])] };
    if (url.pathname === '/pedidos/vendas' && method === 'GET') { const id = this.salesOrders.get(url.searchParams.get('numerosLojas[]')!); return { data: id ? [{ id, numero: id + 100 }] : [] }; }
    if (url.pathname === '/pedidos/vendas' && method === 'POST') {
      if (this.failOrders) throw new Error('Bling 400: contato inválido');
      const id = this.nextId++; this.salesOrders.set((init.body as { numeroLoja: string }).numeroLoja, id); return { data: { id, numero: id + 100 } };
    }
    if (url.pathname === '/nfe' && method === 'GET') { this.invoiceCalls.push({ method, path }); return { data: [] }; }
    if (url.pathname.startsWith('/pedidos/vendas/') && url.pathname.endsWith('/gerar-nfe') && method === 'POST') { this.invoiceCalls.push({ method, path }); return { data: { idNotaFiscal: 3001 } }; }
    if (url.pathname === '/nfe/3001/enviar' && method === 'POST') { this.invoiceCalls.push({ method, path, body: init.body }); return { data: {} }; }
    if (url.pathname === '/nfe/3001' && method === 'GET') { this.invoiceCalls.push({ method, path }); return { data: { id: 3001, numero: 501, serie: 1, chaveAcesso: 'NFE-KEY-123', situacao: 5 } }; }
    if (url.pathname === '/contatos' && method === 'GET') return { data: [] };
    if (url.pathname === '/contatos' && method === 'POST') return { data: { id: 321 } };
    throw new Error(`rota inesperada ${method} ${path}`);
  }
}

const bling = new FakeBling();
// Foto larga de 1600×900, bem diferente do padrão da loja, para provar que a importação ajusta o tamanho.
const images = { downloaded: [] as string[], download: async (url: string) => { images.downloaded.push(url); return sharp({ create: { width: 1600, height: 900, channels: 3, background: '#cc3366' } }).png().toBuffer(); } };
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

beforeAll(async () => {
  process.env.WEB_ORIGIN = 'https://painel.test';
  process.env.BLING_CLIENT_SECRET = 'test-secret';
  ({ app, api } = await startApp(builder => builder.overrideProvider(BlingClient).useValue(bling).overrideProvider(RemoteImageService).useValue(images)));
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { delete process.env.WEB_ORIGIN; delete process.env.BLING_CLIENT_SECRET; await cleanup(app); });
beforeEach(() => { bling.calls = []; bling.failOrders = false; });

const connect = (storeId: string) => prisma.blingConnection.create({ data: { storeId, companyId: '777', accessTokenEnc: encryptSecret('acc', resolveJwtSecret()), refreshTokenEnc: encryptSecret('ref', resolveJwtSecret()), expiresAt: new Date(Date.now() + 3_600_000) } });
const waitFor = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => { for (let i = 0; i < 60; i++) { const value = await read(); if (done(value)) return value; await new Promise(r => setTimeout(r, 100)); } throw new Error('tempo esgotado'); };

describe('conexão com o Bling', () => {
  it('gera o link de autorização e conclui no callback com state assinado', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const { body } = await api('/bling/connect', { token });
    expect(body.url).toContain('https://bling.test/authorize?state=');
    const state = new URL(body.url).searchParams.get('state')!;
    const ok = await fetch(`${baseUrl}/api/v1/bling/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toBe('https://painel.test/admin/bling?conectado=1');
    const saved = await prisma.blingConnection.findUniqueOrThrow({ where: { storeId: store.id } });
    expect(saved.accessTokenEnc).not.toContain('acc-authorization_code');
    expect(saved.companyId).toBe('777');
    expect((await api('/bling/status', { token })).body).toMatchObject({ appConfigured: true, connected: true });

    const bad = await fetch(`${baseUrl}/api/v1/bling/callback?code=abc&state=${encodeURIComponent(makeState(store.id, Date.now() - 3_600_000))}`, { redirect: 'manual' });
    expect(bad.headers.get('location')).toContain('erro=1');
    expect((await fetch(`${baseUrl}/api/v1/bling/callback?code=abc&state=forjado.abc`, { redirect: 'manual' })).headers.get('location')).toContain('erro=1');
    await api('/bling/connection', { method: 'DELETE', token });
    expect(await prisma.blingConnection.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('exige permissão e conexão', async () => {
    const { store } = await createStore();
    expect((await api('/bling/status')).status).toBe(401);
    expect((await api('/bling/import', { method: 'POST', token: await login(api, store, ['catalog.write', 'settings.write']) })).status).toBe(503);
    expect((await api('/bling/status', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
  });
});

describe('importação de produtos do Bling', () => {
  it('cria produtos, variações, estoque e categorias; reimportar atualiza sem duplicar', async () => {
    const { store } = await createStore();
    await connect(store.id);
    const token = await login(api, store, ['catalog.write', 'settings.write']);
    expect((await api('/bling/import', { method: 'POST', token })).status).toBe(202);
    const done = await waitFor(async () => (await api('/bling/status', { token })).body.import, job => job.status !== 'RUNNING');
    expect(done).toMatchObject({ status: 'DONE', total: 3, created: 2, failed: 1 });
    expect(done.errors[0].message).toContain('sem código');

    const blusa = await prisma.product.findFirstOrThrow({ where: { storeId: store.id, sku: 'BR-1' }, include: { variants: true, images: true, categories: { include: { category: true } }, inventory: true } });
    expect(blusa).toMatchObject({ name: 'Blusa de Renda', status: 'ACTIVE', description: 'Linda blusa' });
    expect(blusa.variants.map(v => v.sku).sort()).toEqual(['BR-1-G', 'BR-1-P']);
    expect(blusa.images).toHaveLength(1);
    expect(blusa.images[0].url).toMatch(/\/api\/v1\/media\/[0-9a-f-]{36}$/);
    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { id: blusa.images[0].url.split('/').pop() } });
    expect([asset.width, asset.height, asset.mime]).toEqual([1000, 1250, 'image/jpeg']);
    expect(blusa.categories.map(c => c.category.name).sort()).toEqual(['Blusas', 'Manga Longa', 'Renda']);
    expect(blusa.inventory.reduce((sum, i) => sum + i.quantity, 0)).toBe(6);
    const calca = await prisma.product.findFirstOrThrow({ where: { storeId: store.id, sku: 'CP-1' }, include: { inventory: true } });
    expect(calca.inventory[0].quantity).toBe(7);

    const priceBefore = (await prisma.product.findFirstOrThrow({ where: { storeId: store.id, sku: 'CP-1' } })).price.toString();
    (bling.products[2] as { preco: number; nome: string; estoque: { saldoVirtualTotal: number } }).preco = 160;
    (bling.products[2] as { estoque: { saldoVirtualTotal: number } }).estoque.saldoVirtualTotal = 3;
    (bling.products[2] as { nome: string }).nome = 'Calça Nova';
    const quantityOf = async () => (await prisma.product.findFirstOrThrow({ where: { sku: 'CP-1', storeId: store.id }, include: { inventory: true } })).inventory[0].quantity;

    // padrão: só cria o que falta; produto existente não é tocado
    await api('/bling/import', { method: 'POST', token });
    const again = await waitFor(async () => (await api('/bling/status', { token })).body.import, job => job.status !== 'RUNNING' && job.id !== done.id);
    expect(again).toMatchObject({ mode: 'new', created: 0, updated: 0, skipped: 2 });
    expect(await prisma.product.count({ where: { storeId: store.id, sku: 'CP-1' } })).toBe(1);
    expect(await quantityOf()).toBe(7);

    // atualizar: dados descritivos mudam, preço, situação e estoque da loja ficam
    await api('/bling/import', { method: 'POST', token, body: { mode: 'update' } });
    const updated = await waitFor(async () => (await api('/bling/status', { token })).body.import, job => job.status !== 'RUNNING' && job.id !== again.id);
    expect(updated).toMatchObject({ mode: 'update', created: 0, updated: 2, skipped: 0 });
    const calcaNow = await prisma.product.findFirstOrThrow({ where: { sku: 'CP-1', storeId: store.id } });
    expect(calcaNow.name).toBe('Calça Nova');
    expect(calcaNow.price.toString()).toBe(priceBefore);
    expect(await quantityOf()).toBe(7);
  });
});

describe('importação escolhendo produtos', () => {
  it('lista os ativos do Bling, importa só os escolhidos, padroniza as fotos e liga o estoque', async () => {
    const { store } = await createStore();
    await connect(store.id);
    const token = await login(api, store, ['catalog.write', 'settings.write']);
    images.downloaded = [];

    const list = await api('/bling/products', { token });
    expect(list.status).toBe(200);
    expect(list.body.items.map((i: { sku: string | null }) => i.sku)).toEqual(['BR-1', 'CP-1', null]);
    expect(list.body.items[0]).toMatchObject({ name: 'Blusa de Renda', hasVariations: true, inStore: false });
    expect((await api('/bling/products?q=calça', { token })).body.items).toHaveLength(1);

    expect((await api('/bling/import', { method: 'POST', token, body: { ids: [] } })).status).toBe(400);
    expect((await api('/bling/import', { method: 'POST', token, body: { ids: ['x'] } })).status).toBe(400);
    expect((await api('/bling/import', { method: 'POST', token, body: { ids: [2] } })).status).toBe(202);
    const done = await waitFor(async () => (await api('/bling/status', { token })).body.import, job => job.status !== 'RUNNING');
    expect(done).toMatchObject({ status: 'DONE', total: 1, created: 1, failed: 0 });
    expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(3); // 2 do helper + o escolhido
    expect(await prisma.product.count({ where: { storeId: store.id, sku: 'BR-1' } })).toBe(0);
    expect((await prisma.blingConnection.findUniqueOrThrow({ where: { storeId: store.id } })).stockSyncEnabled).toBe(true);
    expect((await api('/bling/products', { token })).body.items[1]).toMatchObject({ sku: 'CP-1', inStore: true });
  });
});

describe('pedidos do site no Bling', () => {
  it('envia ao Bling pedidos pendentes e anteriores à conexão, preservando os dois números', async () => {
    const { store, product } = await createStore(5);
    const checkout = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 2 }], 'BOLETO'), cpf: '529.982.247-25' } });
    expect(checkout.status).toBe(201);
    const order = await prisma.order.findFirstOrThrow({ where: { number: checkout.body.number } });
    await connect(store.id);
    const orders = app.get(BlingOrdersService);

    expect(await orders.processDue()).toBe(1);
    const sync = await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(sync).toMatchObject({ status: 'SENT', blingOrderId: '9000', blingOrderNumber: '9100', attempts: 0 });

    await app.get(OrderLifecycleService).markPaid({ orderId: order.id });
    expect(await orders.processDue()).toBe(0);
    const contact = bling.calls.find(c => c.method === 'POST' && c.path === '/contatos')!.body;
    expect(contact).toMatchObject({ nome: 'Maria Silva', numeroDocumento: '52998224725', email: 'maria@example.com' });
    expect(bling.calls.find(c => c.path.startsWith('/contatos?') && c.method === 'GET')!.path).toContain('numeroDocumento=52998224725');
    const sale = bling.calls.find(c => c.method === 'POST' && c.path === '/pedidos/vendas')!.body as { numeroLoja: string; contato: { id: number }; itens: { codigo: string; quantidade: number; produto?: { id: number } }[] };
    expect(sale).toMatchObject({ numeroLoja: checkout.body.number, contato: { id: 321 }, itens: [{ codigo: 'VASO-1', quantidade: 2, produto: { id: 555 } }] });
    expect((await prisma.customer.findFirstOrThrow({ where: { storeId: store.id } })).document).toBe('52998224725');

    // Não envia duas vezes.
    bling.calls = [];
    expect(await orders.processDue()).toBe(0);
    expect(bling.calls).toHaveLength(0);
  });


  it('autentica o webhook e devolve situação do Bling ao pedido STOREOS', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'PIX') });
    const order = await prisma.order.findFirstOrThrow({ where: { number: checkout.body.number } });
    await app.get(BlingOrdersService).processDue();

    const sent = await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } });
    const event = {
      eventId: 'evt-bl-1',
      event: 'order.updated',
      companyId: 777,
      data: { id: Number(sent.blingOrderId), numero: sent.blingOrderNumber, situacao: { id: 42, valor: 1 } },
    };
    const body = JSON.stringify(event);
    const signature = 'sha256=' + createHmac('sha256', 'test-secret').update(body).digest('hex');
    const response = await api('/bling/webhook', { method: 'POST', body: event, headers: { 'x-bling-signature-256': signature } });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, ignored: false, queued: true, duplicate: false });
    const duplicate = await api('/bling/webhook', { method: 'POST', body: event, headers: { 'x-bling-signature-256': signature } });
    expect(duplicate.body).toMatchObject({ queued: false, duplicate: true });
    expect(await prisma.blingWebhookEvent.count({ where: { eventId: 'evt-bl-1' } })).toBe(1);
    await app.get(BlingWebhookService).processDue();
    expect(await prisma.blingWebhookEvent.findUniqueOrThrow({ where: { eventId: 'evt-bl-1' } })).toMatchObject({ status: 'PROCESSED', attempts: 0 });
    expect(await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      blingOrderNumber: sent.blingOrderNumber,
      blingSituationId: '42',
      blingSituationName: 'Em aberto',
    });

    const invalid = await api('/bling/webhook', { method: 'POST', body: event, headers: { 'x-bling-signature-256': 'sha256=00' } });
    expect(invalid.status).toBe(401);
  });

  it('corrige o vínculo da empresa pelo próprio webhook quando há uma única conexão', async () => {
    await prisma.blingConnection.deleteMany({});
    const { store } = await createStore(5);
    await connect(store.id);
    await prisma.blingConnection.update({ where: { storeId: store.id }, data: { companyId: '123', lastError: 'sem permissão' } });
    const event = { eventId: `evt-bl-link-${Date.now()}`, event: 'order.updated', companyId: 888, data: { id: 1, numero: '1', situacao: { id: 42 } } };
    const signature = 'sha256=' + createHmac('sha256', 'test-secret').update(JSON.stringify(event)).digest('hex');
    const response = await api('/bling/webhook', { method: 'POST', body: event, headers: { 'x-bling-signature-256': signature } });
    expect(response.body).toMatchObject({ ignored: false, queued: true });
    expect(await prisma.blingConnection.findUniqueOrThrow({ where: { storeId: store.id } })).toMatchObject({ companyId: '888', lastError: null });
  });

  it('falha fica registrada com espera, e o reenvio manual conclui sem duplicar', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const checkout = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), cpf: '529.982.247-25' } });
    const order = await prisma.order.findFirstOrThrow({ where: { number: checkout.body.number } });
    await app.get(OrderLifecycleService).markPaid({ orderId: order.id });
    const orders = app.get(BlingOrdersService);

    bling.failOrders = true;
    await orders.processDue();
    const failed = await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(failed.lastError).toContain('contato inválido');
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await orders.processDue()).toBe(0); // dentro da espera

    bling.failOrders = false;
    bling.calls = [];
    const operator = await login(api, store, ['orders.read', 'orders.write']);
    const resent = await api(`/bling/orders/${checkout.body.number}/send`, { method: 'POST', token: operator });
    expect(resent.status).toBe(200);
    expect(resent.body).toMatchObject({ status: 'SENT', attempts: 0 });
    const list = await api('/bling/orders', { token: operator });
    expect(list.body.counts).toEqual({ SENT: 1 });
    expect(list.body.items[0]).toMatchObject({ orderNumber: checkout.body.number, status: 'SENT' });
    expect(bling.calls.filter(c => c.method === 'POST' && c.path === '/pedidos/vendas')).toHaveLength(1);
  });

  it('se o Bling já tem o pedido (timeout anterior), reaproveita em vez de duplicar', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const checkout = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO'), cpf: '529.982.247-25' } });
    const order = await prisma.order.findFirstOrThrow({ where: { number: checkout.body.number } });
    await app.get(OrderLifecycleService).markPaid({ orderId: order.id });
    bling.salesOrders.set(checkout.body.number, 777);
    await app.get(BlingOrdersService).processDue();
    expect((await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } })).blingOrderId).toBe('777');
    expect((await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } })).blingOrderNumber).toBe('877');
    expect(bling.calls.some(c => c.method === 'POST' && c.path === '/pedidos/vendas')).toBe(false);
  });
  it('emite NF-e vinculada ao pedido Bling, reusa o documento e registra autorização fiscal', async () => {
    const { store, product } = await createStore(5);
    await connect(store.id);
    const checkout = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'PIX') });
    const order = await prisma.order.findFirstOrThrow({ where: { number: checkout.body.number } });
    await app.get(OrderLifecycleService).markPaid({ orderId: order.id });
    await app.get(BlingOrdersService).processDue();

    const operator = await login(api, store, ['orders.read', 'orders.write']);
    const requested = await api(`/bling/orders/${order.number}/invoice`, { method: 'POST', token: operator });
    expect(requested.status).toBe(202);
    expect(requested.body.status).toBe('QUEUED');
    expect(await app.get(BlingInvoicesService).processDue()).toBe(1);

    const invoice = await prisma.blingInvoice.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(invoice).toMatchObject({ status: 'AUTHORIZED', blingInvoiceId: '3001', invoiceNumber: '501', series: '1', accessKey: 'NFE-KEY-123' });
    expect(invoice.submittedAt).toBeTruthy();
    expect(invoice.authorizedAt).toBeTruthy();
    expect(await prisma.fulfillment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ invoiceNumber: '501', invoiceKey: 'NFE-KEY-123' });
    const sync = await prisma.blingOrderSync.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(bling.invoiceCalls.some(call => call.method === 'POST' && call.path === `/pedidos/vendas/${sync.blingOrderId}/gerar-nfe`)).toBe(true);
    expect(bling.invoiceCalls.filter(call => call.method === 'POST' && call.path === '/nfe/3001/enviar')).toHaveLength(1);
  });

});
