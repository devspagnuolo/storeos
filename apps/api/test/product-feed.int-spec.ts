import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let base: string;

beforeAll(async () => {
  process.env.PUBLIC_SITE_URL = 'https://loja.example.com';
  ({ app, api } = await startApp());
  base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api/v1`;
});
afterAll(() => cleanup(app));

describe('vitrine para Google e Meta', () => {
  it('publica XML e planilha por loja, com variações e estoque, e mostra o que falta', async () => {
    const { store, product } = await createStore(4);
    const other = await createStore(1);
    await prisma.productImage.create({ data: { productId: product.id, url: '/media/vaso.jpg', position: 0 } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: 'VASO-1-M', attributes: [{ name: 'Cor', value: 'Azul' }, { name: 'Tamanho', value: 'M' }], gtin: '7891000100103' } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, variantId: variant.id, quantity: 2 } });

    const xml = await fetch(`${base}/feeds/google.xml?store=${store.slug}`);
    expect(xml.status).toBe(200);
    expect(xml.headers.get('content-type')).toContain('application/xml');
    const text = await xml.text();
    expect(text).toContain('<g:id>VASO-1-M</g:id>');
    expect(text).toContain('<g:availability>in stock</g:availability>');
    expect(text).toContain('<link>https://loja.example.com/produto/vaso</link>');
    expect(text).toContain('<g:image_link>https://loja.example.com/media/vaso.jpg</g:image_link>');
    expect(text).toContain('<g:gtin>7891000100103</g:gtin>');
    expect(text).not.toContain('Rascunho');

    const csv = await (await fetch(`${base}/feeds/meta.csv?store=${store.slug}`)).text();
    expect(csv.split('\n')[1]).toContain('VASO-1-M,Vaso azul - Azul / M');

    // Outra loja não vê os produtos desta; loja inexistente dá 404.
    expect(await (await fetch(`${base}/feeds/google.xml?store=${other.store.slug}`)).text()).not.toContain('VASO-1-M');
    expect((await fetch(`${base}/feeds/google.xml?store=nao-existe`)).status).toBe(404);

    const admin = await login(api, store, ['catalog.write']);
    expect((await api('/feeds/status', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
    const status = await api('/feeds/status', { token: admin });
    expect(status.body).toMatchObject({ siteConfigured: true, products: 1, withoutPhoto: 0 });
    expect(status.body.google).toContain(`store=${store.slug}`);
    expect(status.body.counts.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['no-brand', 'no-description']));
  });
});
