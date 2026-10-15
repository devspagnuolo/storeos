import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { checkoutBody, cleanup, createStore, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

const cpf = '529.982.247-25';
const save = (storeSlug: string, token: string, data: Record<string, unknown>, cpfValue?: string) => api('/checkout/draft', { method: 'PUT', body: { storeSlug, token, cpf: cpfValue, data } });
const identify = (storeSlug: string, token: string, cpfValue = cpf) => api('/checkout/identify', { method: 'POST', body: { storeSlug, token, cpf: cpfValue } });
const confirm = (storeSlug: string, token: string, email: string) => api('/checkout/identify/confirm', { method: 'POST', body: { storeSlug, token, cpf, email } });

describe('rascunho do checkout e identificação pelo CPF', () => {
  it('grava cada campo, recupera no mesmo aparelho e descarta o que não é do formulário', async () => {
    const { store } = await createStore();
    const token = randomUUID();
    expect((await identify(store.slug, token)).body).toEqual({ status: 'new' });
    expect((await save(store.slug, token, { name: 'Ana Souza', zipCode: '01310-100', cardNumber: '4111111111111111' }, cpf)).body).toEqual({ saved: true });
    expect((await save(store.slug, token, { name: 'Ana Souza', email: 'ana@example.com', zipCode: '01310-100', street: 'Av. Paulista' }, cpf)).status).toBe(200);
    const again = await identify(store.slug, token);
    expect(again.body).toEqual({ status: 'draft', data: { name: 'Ana Souza', email: 'ana@example.com', zipCode: '01310-100', street: 'Av. Paulista' } });
    expect(JSON.stringify((await prisma.checkoutDraft.findUniqueOrThrow({ where: { token } })).data)).not.toContain('4111');
  });

  it('em outro aparelho, o CPF só revela o e-mail mascarado; os dados vêm com o e-mail certo', async () => {
    const { store, product } = await createStore();
    await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]), customer: { name: 'Maria Silva', email: 'maria@example.com', phone: '(11) 98888-7777' } } });
    const other = randomUUID();
    const known = await identify(store.slug, other);
    expect(known.body).toEqual({ status: 'known', maskedEmail: 'ma***@example.com' });
    expect(JSON.stringify(known.body)).not.toContain('Paulista');
    expect((await confirm(store.slug, other, 'outra@example.com')).body).toEqual({ matched: false });
    const ok = await confirm(store.slug, other, 'MARIA@example.com');
    expect(ok.body).toEqual({ matched: true, data: expect.objectContaining({ name: 'Maria Silva', email: 'maria@example.com', phone: '11988887777', zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' }) });
    // Depois de confirmado, o próprio aparelho já recupera pelo token.
    expect((await identify(store.slug, other)).body.status).toBe('draft');
  });

  it('o rascunho some quando o pedido é gerado', async () => {
    const { store, product } = await createStore();
    const token = randomUUID();
    await save(store.slug, token, { name: 'Maria Silva' }, cpf);
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) })).status).toBe(201);
    expect(await prisma.checkoutDraft.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('um token de outra loja não é sobrescrito nem lido', async () => {
    const a = await createStore();
    const b = await createStore();
    const token = randomUUID();
    await save(a.store.slug, token, { name: 'Loja A' }, cpf);
    expect((await save(b.store.slug, token, { name: 'Loja B' }, cpf)).body).toEqual({ saved: false });
    expect((await identify(b.store.slug, token)).body).toEqual({ status: 'new' });
  });
});

describe('estoque disponível para o carrinho', () => {
  it('informa saldo livre e preço atual, e marca produto fora de venda', async () => {
    const { store, product, draft } = await createStore(3);
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }]) });
    const result = await api('/catalog/availability', { method: 'POST', body: { store: store.slug, items: [{ productId: product.id }, { productId: draft.id }, { productId: randomUUID() }] } });
    expect(result.body).toEqual([
      { productId: product.id, variantId: null, active: true, available: 2, price: '49.90' },
      { productId: draft.id, variantId: null, active: false, available: 0, price: null },
      expect.objectContaining({ active: false, available: 0 }),
    ]);
  });

  it('pedido acima do estoque diz quantas unidades restam', async () => {
    const { store, product } = await createStore(2);
    const result = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 3 }]) });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: 'OUT_OF_STOCK', available: 2, message: expect.stringMatching(/só 2 unidade/) });
  });
});
