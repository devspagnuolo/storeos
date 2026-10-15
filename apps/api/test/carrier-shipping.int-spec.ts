import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';
import { CARRIER_QUOTES, CarrierPackage } from '../src/modules/shipping/carrier';
import { money } from '../src/shared/money/money';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
const calls: { fromZip?: string; toZip: string; packages: CarrierPackage[] }[] = [];
let failing = false;
const fake = {
  enabled: true, provider: 'fake',
  quote: async (input: { fromZip?: string; toZip: string; packages: CarrierPackage[] }) => {
    calls.push(input);
    if (failing) throw new Error('indisponível');
    return [{ id: 'me:1', name: 'Correios PAC', price: money('22.50'), minDays: 5, maxDays: 8 }, { id: 'me:2', name: 'Correios SEDEX', price: money('45.10'), minDays: 2, maxDays: 2 }];
  },
};

beforeAll(async () => {
  delete process.env.SHIPPING_ORIGIN_ZIP;
  ({ app, api } = await startApp(builder => builder.overrideProvider(CARRIER_QUOTES).useValue(fake)));
});
afterAll(() => cleanup(app));
beforeEach(() => { calls.length = 0; failing = false; });

describe('frete por transportadora', () => {
  it('cota pelo peso do produto, cobra o valor da transportadora no checkout e recusa opção inventada', async () => {
    const { store, product } = await createStore(10);
    await prisma.store.update({ where: { id: store.id }, data: { shippingOriginZip: '30130-010' } });
    const admin = await login(api, store, ['catalog.write', 'orders.read']);
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', token: admin, body: { weightGrams: 600, widthCm: 30, heightCm: 8, lengthCm: 40 } });

    const items = [{ productId: product.id, quantity: 2 }];
    const quote = await api('/shipping/quote', { method: 'POST', body: { storeSlug: store.slug, zipCode: '01310-100', items } });
    expect(quote.body).toMatchObject({ required: true, options: [{ id: 'me:1', name: 'Correios PAC', price: '22.50', minDays: 5, maxDays: 8 }, { id: 'me:2', price: '45.10' }] });
    expect(calls[0]).toMatchObject({ toZip: '01310100', packages: [{ weightKg: 0.6, widthCm: 30, heightCm: 8, lengthCm: 40, quantity: 2, unitValue: 49.9 }] });

    const order = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: 'me:2' } });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ shipping: '45.10', shippingMethod: 'Correios SEDEX', subtotal: '99.80', total: '144.90' });

    const forged = await api('/checkout', { method: 'POST', body: { ...checkoutBody(store.slug, items, 'BOLETO'), shippingRuleId: 'me:99' } });
    expect(forged.status).toBe(400);
    expect((await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, items, 'BOLETO') })).status).toBe(400);
  });

  it('mistura com regras da loja, usa só elas se a transportadora cair e avisa quando não há alternativa', async () => {
    const { store, product } = await createStore(10);
    await prisma.store.update({ where: { id: store.id }, data: { shippingOriginZip: '30130010' } });
    const admin = await login(api, store, ['settings.write']);
    const items = [{ productId: product.id, quantity: 1 }];
    const body = { storeSlug: store.slug, zipCode: '01310-100', items };

    // Sem regras e com a transportadora fora do ar, o cliente tenta de novo mais tarde.
    failing = true;
    expect((await api('/shipping/quote', { method: 'POST', body })).status).toBe(503);
    failing = false;

    // Frete grátis exclusivo (acima de R$ 40) aparece junto das opções da transportadora.
    await api('/shipping/rules', { method: 'POST', token: admin, body: { name: 'Frete grátis', price: 0, freeAbove: 40, freeOnly: true, minDays: 5, maxDays: 9 } });
    const withFree = await api('/shipping/quote', { method: 'POST', body });
    expect(withFree.body.options.map((o: { id: string }) => o.id)).toEqual([expect.any(String), 'me:1', 'me:2']);
    expect(withFree.body.options[0]).toMatchObject({ name: 'Frete grátis', price: '0.00', free: true });

    // Com regra cadastrada, a falha da transportadora só tira as opções dela.
    failing = true;
    const fallback = await api('/shipping/quote', { method: 'POST', body });
    expect(fallback.status).toBe(200);
    expect(fallback.body.options).toHaveLength(1);
    const status = await api('/shipping/carrier', { token: admin });
    expect(status.body).toMatchObject({ enabled: true, provider: 'fake' });
    expect((await prisma.shippingRule.findMany({ where: { storeId: store.id } }))[0].freeOnly).toBe(true);
  });

  it('CEP de origem é cadastrado no painel por loja, com o do servidor só como reserva', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['settings.write']);
    const body = { storeSlug: store.slug, zipCode: '01310-100', items: [{ productId: product.id, quantity: 1 }] };

    // Sem CEP de origem em lugar nenhum, a transportadora não cota e a loja segue sem frete calculado.
    expect((await api('/shipping/carrier', { token: admin })).body).toMatchObject({ enabled: false, credentials: true, originZip: null, originSource: null });
    const off = await api('/shipping/quote', { method: 'POST', body });
    expect(off.body).toMatchObject({ required: false, options: [] });
    expect(calls).toHaveLength(0);

    // Cadastra no painel (aceita máscara) e passa a cotar saindo desse CEP.
    expect((await api('/shipping/origin', { method: 'PUT', token: admin, body: { zipCode: '30130-010' } })).body).toMatchObject({ enabled: true, originZip: '30130010', originSource: 'store' });
    await api('/shipping/quote', { method: 'POST', body });
    expect(calls[0].fromZip).toBe('30130010');

    // CEP inválido é recusado; sem permissão também.
    expect((await api('/shipping/origin', { method: 'PUT', token: admin, body: { zipCode: '12345' } })).status).toBe(400);
    expect((await api('/shipping/origin', { method: 'PUT', body: { zipCode: '30130010' } })).status).toBe(401);

    // Limpar volta ao CEP do servidor, se houver.
    process.env.SHIPPING_ORIGIN_ZIP = '80010-000';
    try {
      expect((await api('/shipping/origin', { method: 'PUT', token: admin, body: { zipCode: null } })).body).toMatchObject({ originZip: '80010000', originSource: 'server' });
      calls.length = 0;
      await api('/shipping/quote', { method: 'POST', body });
      expect(calls[0].fromZip).toBe('80010000');
      // O cadastro da loja tem prioridade sobre o do servidor.
      await api('/shipping/origin', { method: 'PUT', token: admin, body: { zipCode: '30130010' } });
      calls.length = 0;
      await api('/shipping/quote', { method: 'POST', body });
      expect(calls[0].fromZip).toBe('30130010');
    } finally {
      delete process.env.SHIPPING_ORIGIN_ZIP;
    }
  });
});
