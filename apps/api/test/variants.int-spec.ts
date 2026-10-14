import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

const attrs = (color: string, size: string) => [{ name: 'Cor', value: color }, { name: 'Tamanho', value: size }];

describe('variações de produto', () => {
  it('cadastra variações, vende por variação com estoque próprio e devolve ao cancelar', async () => {
    const { store, product } = await createStore(5);
    const admin = await login(api, store, ['catalog.write', 'orders.write', 'orders.read']);
    const saved = await api(`/catalog/products/${product.id}/variants`, { method: 'PUT', token: admin, body: { variants: [
      { sku: 'VASO-AZ-G', attributes: attrs('Azul', 'G'), stock: 3 },
      { sku: 'VASO-RS-G', attributes: attrs('Rosa', 'G'), price: 59.9, stock: 1 },
    ] } });
    expect(saved.status).toBe(200);
    expect(saved.body.variants).toMatchObject([{ sku: 'VASO-AZ-G', stock: 3 }, { sku: 'VASO-RS-G', price: '59.9', stock: 1 }]);
    // O saldo do produto deixa de existir: agora é por variação.
    expect(await prisma.inventory.count({ where: { productId: product.id, variantId: null } })).toBe(0);

    const detail = await api(`/catalog/products/vaso?store=${store.slug}`);
    expect(detail.body.available).toBe(4);
    expect(detail.body.variants).toMatchObject([{ sku: 'VASO-AZ-G', available: 3 }, { sku: 'VASO-RS-G', available: 1 }]);
    const [azul, rosa] = detail.body.variants as { id: string }[];

    // Sem escolher a opção, ou com opção de outro produto, o pedido é recusado.
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') })).status).toBe(400);
    const other = await createStore();
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, variantId: other.product.id, quantity: 1 } as never], 'BOLETO') })).status).toBe(400);

    // Rosa tem só 1 unidade; Azul vende 2 e usa o preço do produto.
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, variantId: rosa.id, quantity: 2 } as never], 'BOLETO') })).status).toBe(409);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, variantId: azul.id, quantity: 2 } as never, { productId: product.id, variantId: rosa.id, quantity: 1 } as never], 'BOLETO') });
    expect(order.status).toBe(201);
    expect(order.body.items).toMatchObject([{ sku: 'VASO-AZ-G', name: 'Vaso azul (Azul / G)', unitPrice: '49.90' }, { sku: 'VASO-RS-G', unitPrice: '59.90' }]);
    expect(order.body.subtotal).toBe('159.70');
    const stock = async (id: string) => prisma.inventory.findFirstOrThrow({ where: { variantId: id } });
    expect(await stock(azul.id)).toMatchObject({ quantity: 3, reserved: 2 });
    expect(await stock(rosa.id)).toMatchObject({ quantity: 1, reserved: 1 });

    // Pagar baixa o saldo da variação; cancelar um pedido novo devolve a reserva dela.
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    expect(await stock(azul.id)).toMatchObject({ quantity: 1, reserved: 0 });
    const second = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, variantId: azul.id, quantity: 1 } as never], 'BOLETO') });
    expect(await stock(azul.id)).toMatchObject({ quantity: 1, reserved: 1 });
    await api(`/orders/${second.body.number}/cancel`, { method: 'POST', token: admin, body: {} });
    expect(await stock(azul.id)).toMatchObject({ quantity: 1, reserved: 0 });
  });

  it('valida a edição: SKU repetido, combinação repetida, remoção com reserva e abaixo do reservado', async () => {
    const { store, product } = await createStore(5);
    const admin = await login(api, store, ['catalog.write']);
    const put = (variants: unknown[]) => api(`/catalog/products/${product.id}/variants`, { method: 'PUT', token: admin, body: { variants } });
    expect((await put([{ sku: 'A', attributes: attrs('Azul', 'P'), stock: 1 }, { sku: 'A', attributes: attrs('Azul', 'M'), stock: 1 }])).status).toBe(400);
    expect((await put([{ sku: 'A', attributes: attrs('Azul', 'P'), stock: 1 }, { sku: 'B', attributes: attrs('azul', 'p'), stock: 1 }])).status).toBe(400);
    expect((await put([{ sku: 'A', attributes: attrs('Azul', 'P'), stock: 1 }, { sku: 'B', attributes: [{ name: 'Tamanho', value: 'M' }], stock: 1 }])).status).toBe(400);

    const ok = await put([{ sku: 'A', attributes: attrs('Azul', 'P'), stock: 4 }, { sku: 'B', attributes: attrs('Azul', 'M'), stock: 2 }]);
    const [a, b] = ok.body.variants as { id: string }[];
    await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, variantId: a.id, quantity: 3 } as never], 'BOLETO') });

    expect((await put([{ id: a.id, sku: 'A', attributes: attrs('Azul', 'P'), stock: 2 }, { id: b.id, sku: 'B', attributes: attrs('Azul', 'M'), stock: 2 }])).status).toBe(400);
    expect((await put([{ id: b.id, sku: 'B', attributes: attrs('Azul', 'M'), stock: 2 }])).status).toBe(400);
    // Remover a variação sem reserva e renomear mantém a outra.
    const trimmed = await put([{ id: a.id, sku: 'A', attributes: attrs('Azul', 'P'), stock: 5 }]);
    expect(trimmed.status).toBe(200);
    expect(trimmed.body.variants).toHaveLength(1);

    // Limpar todas só é possível sem reservas; depois o produto volta a ter saldo próprio.
    expect((await put([])).status).toBe(400);
  });

  it('promoção por SKU do produto vale para as variações e a lista do painel soma os saldos', async () => {
    const { store, product } = await createStore(5);
    const admin = await login(api, store, ['catalog.write', 'marketing.write']);
    const saved = await api(`/catalog/products/${product.id}/variants`, { method: 'PUT', token: admin, body: { variants: [{ sku: 'V-1', attributes: attrs('Azul', 'P'), stock: 4 }, { sku: 'V-2', attributes: attrs('Azul', 'M'), stock: 6 }] } });
    await api('/promotions', { method: 'POST', token: admin, body: { name: '10% no vaso', type: 'PERCENT_OFF', value: 10, skus: ['VASO-1'] } });
    const preview = await api('/promotions/preview', { method: 'POST', body: { storeSlug: store.slug, items: [{ productId: product.id, variantId: saved.body.variants[0].id, quantity: 2 }] } });
    expect(preview.body).toMatchObject({ subtotal: '99.80', discount: '9.98' });
    const list = await api('/catalog/admin/products', { token: admin });
    expect(list.body.items.find((p: { sku: string }) => p.sku === 'VASO-1')).toMatchObject({ variantCount: 2, stock: 10 });
  });
});
