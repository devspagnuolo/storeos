import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';
import { CARRIER_QUOTES, CarrierPackage } from '../src/modules/shipping/carrier';
import { money } from '../src/shared/money/money';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
const calls: { toZip: string; packages: CarrierPackage[] }[] = [];
let failing = false;
const fake = {
  enabled: true, provider: 'fake',
  quote: async (input: { toZip: string; packages: CarrierPackage[] }) => {
    calls.push(input);
    if (failing) throw new Error('indisponível');
    return [{ id: 'me:1', name: 'Correios PAC', price: money('22.50'), minDays: 5, maxDays: 8 }, { id: 'me:2', name: 'Correios SEDEX', price: money('45.10'), minDays: 2, maxDays: 2 }];
  },
};

beforeAll(async () => ({ app, api } = await startApp(builder => builder.overrideProvider(CARRIER_QUOTES).useValue(fake))));
afterAll(() => cleanup(app));
beforeEach(() => { calls.length = 0; failing = false; });

describe('frete por transportadora', () => {
  it('cota pelo peso do produto, cobra o valor da transportadora no checkout e recusa opção inventada', async () => {
    const { store, product } = await createStore(10);
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
});
