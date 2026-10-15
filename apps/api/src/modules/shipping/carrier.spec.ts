import { money } from '../../shared/money/money';
import { buildPackages, DEFAULT_PACKAGE } from './carrier';
import { MelhorEnvioClient } from './melhor-envio.client';
import { superFreteHost, SuperFreteClient } from './superfrete.client';

describe('pacotes para transportadoras', () => {
  it('usa as medidas do produto e cai no padrão quando faltam', () => {
    const products = [
      { id: 'a', price: money('99.90'), weightGrams: 450, widthCm: 30, heightCm: 6, lengthCm: 35 },
      { id: 'b', price: '50.00', weightGrams: null, widthCm: null, heightCm: null, lengthCm: null },
    ];
    const [a, b] = buildPackages([{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 1 }], products);
    expect(a).toMatchObject({ weightKg: 0.45, widthCm: 30, heightCm: 6, lengthCm: 35, unitValue: 99.9, quantity: 2 });
    expect(b).toMatchObject({ weightKg: DEFAULT_PACKAGE.weightGrams / 1000, widthCm: DEFAULT_PACKAGE.widthCm, unitValue: 50 });
  });
});

describe('MelhorEnvioClient', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; jest.restoreAllMocks(); });

  it('fica ativo com o token; o CEP de origem é decidido por loja', () => {
    delete process.env.MELHOR_ENVIO_TOKEN;
    expect(new MelhorEnvioClient().enabled).toBe(false);
    process.env.MELHOR_ENVIO_TOKEN = 't';
    expect(new MelhorEnvioClient().enabled).toBe(true);
  });

  it('converte a resposta, ignora serviços com erro e usa o preço personalizado', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 't';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { id: 1, name: 'PAC', price: '25.00', custom_price: '22.50', delivery_range: { min: 5, max: 8 }, company: { name: 'Correios' } },
      { id: 2, name: 'SEDEX', price: '45.10', delivery_time: 2, company: { name: 'Correios' } },
      { id: 3, name: '.Package', error: 'Serviço indisponível', company: { name: 'Jadlog' } },
    ])));
    const offers = await new MelhorEnvioClient().quote({ fromZip: '09015000', toZip: '01310100', packages: [{ id: 'p', widthCm: 20, heightCm: 5, lengthCm: 25, weightKg: 0.3, unitValue: 80, quantity: 2 }] });
    expect(offers.map(o => [o.id, o.name, o.price.toFixed(2), o.minDays, o.maxDays])).toEqual([['me:1', 'Correios PAC', '22.50', 5, 8], ['me:2', 'Correios SEDEX', '45.10', 2, 2]]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://melhorenvio.com.br/api/v2/me/shipment/calculate');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: { postal_code: '09015000' }, to: { postal_code: '01310100' }, products: [{ id: 'p', weight: 0.3, insurance_value: 80, quantity: 2 }] });
  });

  it('propaga falha HTTP para o serviço decidir o que fazer', async () => {
    process.env.MELHOR_ENVIO_TOKEN = 't';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new MelhorEnvioClient().quote({ fromZip: '1', toZip: '2', packages: [] })).rejects.toThrow('500');
  });
});

describe('SuperFreteClient', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; jest.restoreAllMocks(); });

  it('só fica ativo com token e CEP de origem', () => {
    delete process.env.SUPERFRETE_TOKEN; delete process.env.SHIPPING_ORIGIN_ZIP;
    expect(new SuperFreteClient().enabled).toBe(false);
    process.env.SUPERFRETE_TOKEN = 't'; process.env.SHIPPING_ORIGIN_ZIP = '09015-000';
    expect(new SuperFreteClient().enabled).toBe(true);
  });

  it('cota PAC, SEDEX e Mini Envios e ignora serviços com erro', async () => {
    process.env.SUPERFRETE_TOKEN = 't';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { id: 1, name: 'PAC', price: 21.5, delivery_range: { min: 4, max: 7 } },
      { id: 2, name: 'SEDEX', price: '38.90', delivery_time: 2 },
      { id: 17, name: 'Mini Envios', price: 14, delivery_time: 6, has_error: true, error: 'Medidas acima do limite' },
    ])));
    const offers = await new SuperFreteClient().quote({ fromZip: '09015000', toZip: '01310100', packages: [{ id: 'p', widthCm: 20, heightCm: 5, lengthCm: 25, weightKg: 0.3, unitValue: 80, quantity: 2 }] });
    expect(offers.map(o => [o.id, o.name, o.price.toFixed(2), o.minDays, o.maxDays])).toEqual([['sf:1', 'Correios PAC', '21.50', 4, 7], ['sf:2', 'Correios SEDEX', '38.90', 2, 2]]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.superfrete.com/api/v0/calculator');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: { postal_code: '09015000' }, to: { postal_code: '01310100' }, services: '1,2,17', products: [{ quantity: 2, weight: 0.3, height: 5 }] });
  });

  it('usa SUPERFRETE_API_URL (sem a barra final) e só aceita https', () => {
    expect(superFreteHost({})).toBe('https://api.superfrete.com');
    expect(superFreteHost({ SUPERFRETE_SANDBOX: 'true' })).toBe('https://sandbox.superfrete.com');
    expect(superFreteHost({ SUPERFRETE_API_URL: 'https://api.superfrete.com/' })).toBe('https://api.superfrete.com');
    expect(superFreteHost({ SUPERFRETE_API_URL: ' https://sandbox.superfrete.com ', SUPERFRETE_SANDBOX: 'false' })).toBe('https://sandbox.superfrete.com');
    expect(superFreteHost({ SUPERFRETE_API_URL: 'http://inseguro.example' })).toBe('https://api.superfrete.com');
    expect(superFreteHost({ SUPERFRETE_API_URL: 'lixo' })).toBe('https://api.superfrete.com');
  });

  it('cota no endereço definido em SUPERFRETE_API_URL', async () => {
    process.env.SUPERFRETE_TOKEN = 't'; process.env.SUPERFRETE_API_URL = 'https://api.superfrete.com/';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('[]'));
    await new SuperFreteClient().quote({ fromZip: '1', toZip: '2', packages: [] });
    expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.superfrete.com/api/v0/calculator');
  });

  it('propaga falha HTTP', async () => {
    process.env.SUPERFRETE_TOKEN = 't';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('no', { status: 401 }));
    await expect(new SuperFreteClient().quote({ fromZip: '1', toZip: '2', packages: [] })).rejects.toThrow('401');
  });
});
