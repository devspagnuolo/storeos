import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('SEO e rastreamento', () => {
  it('salva só IDs válidos, expõe na vitrine e isola por loja e permissão', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['settings.write', 'catalog.write']);
    expect((await api('/seo/tracking', { token: await login(api, store, ['orders.read']) })).status).toBe(403);

    const bad = await api('/seo/tracking', { method: 'PUT', token: admin, body: { ga4: '<script>x</script>' } });
    expect(bad.status).toBe(400);
    const saved = await api('/seo/tracking', { method: 'PUT', token: admin, body: { ga4: 'g-abc123def4', metaPixel: '123456789012345', homeTitle: 'Vivi Moda', homeDescription: 'Moda plus size com entrega para todo o Brasil' } });
    expect(saved.body).toEqual({ ga4: 'G-ABC123DEF4', metaPixel: '123456789012345', homeTitle: 'Vivi Moda', homeDescription: 'Moda plus size com entrega para todo o Brasil' });

    const pub = await api(`/store/public/${store.slug}`);
    expect(pub.body.marketing).toMatchObject({ ga4: 'G-ABC123DEF4', metaPixel: '123456789012345' });
    expect(pub.body.marketingConfig).toBeUndefined();
    expect((await api(`/store/public/${other.store.slug}`)).body.marketing).toEqual({});

    // Limpar um campo remove o ID.
    const cleared = await api('/seo/tracking', { method: 'PUT', token: admin, body: { metaPixel: '' } });
    expect(cleared.body).toEqual({});
  });

  it('audita produtos ativos e mostra as pendências mais graves primeiro', async () => {
    const { store, product } = await createStore();
    const admin = await login(api, store, ['settings.write', 'catalog.write']);
    await prisma.product.create({ data: { storeId: store.id, slug: 'completo', sku: 'COMP-1', name: 'Completo', price: '10.00', status: 'ACTIVE', description: 'x'.repeat(120), seoTitle: 'Completo', images: { create: { url: 'https://cdn.test/a.jpg', alt: 'Foto' } } } });
    const audit = (await api('/seo/audit', { token: admin })).body;
    expect(audit.products).toMatchObject({ total: 2, withIssues: 1 }); // o rascunho do helper não entra
    expect(audit.list[0]).toMatchObject({ id: product.id });
    expect(audit.list[0].labels).toEqual(expect.arrayContaining(['Sem foto', 'Sem descrição']));
    expect(audit.checks.find((c: { id: string }) => c.id === 'analytics').ok).toBe(false);
    expect((await api('/seo/audit', { token: await login(api, store, ['settings.write']) })).status).toBe(403);
  });
});
