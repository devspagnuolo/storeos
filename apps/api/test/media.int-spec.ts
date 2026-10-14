import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

beforeAll(async () => {
  process.env.API_PUBLIC_URL = 'https://api.example.test';
  ({ app, api } = await startApp());
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { delete process.env.API_PUBLIC_URL; await cleanup(app); });

const png = (width: number, height: number) => {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'ascii'); buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
};

async function upload(token: string | undefined, files: { name: string; data: Buffer; type: string }[], kind = 'banner') {
  const form = new FormData();
  for (const file of files) form.append('files', new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  const response = await fetch(`${baseUrl}/api/v1/media/upload?kind=${kind}`, { method: 'POST', body: form, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

describe('upload de imagens', () => {
  it('envia várias imagens de uma vez, lê as dimensões, avisa o tamanho e serve o arquivo', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const result = await upload(token, [{ name: 'a.png', data: png(1920, 700), type: 'image/png' }, { name: 'b.png', data: png(900, 900), type: 'image/png' }]);
    expect(result.status).toBe(201);
    expect(result.body.files).toHaveLength(2);
    expect(result.body.files[0]).toMatchObject({ width: 1920, height: 700, warning: null, name: 'a.png' });
    expect(result.body.files[1].warning).toMatch(/proporção|borrada/);
    const [first] = result.body.files;
    expect(first.url).toMatch(/^https:\/\/api\.example\.test\/api\/v1\/media\/[0-9a-f-]{36}$/);
    const served = await fetch(first.url.replace('https://api.example.test', baseUrl));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await served.arrayBuffer()).equals(png(1920, 700))).toBe(true);
  });

  it('exige login e permissão de catálogo ou configurações', async () => {
    const { store } = await createStore();
    const file = [{ name: 'a.png', data: png(10, 10), type: 'image/png' }];
    expect((await upload(undefined, file)).status).toBe(401);
    expect((await upload(await login(api, store, ['orders.read']), file)).status).toBe(403);
    expect((await upload(await login(api, store, ['catalog.write']), file, 'product')).status).toBe(201);
  });

  it('recusa arquivo que não é imagem de verdade e tipo de uso inválido', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    expect((await upload(token, [{ name: 'x.png', data: Buffer.from('<svg onload=alert(1)/>'), type: 'image/png' }])).status).toBe(400);
    expect((await upload(token, [{ name: 'x.txt', data: Buffer.from('oi'), type: 'text/plain' }])).status).toBe(400);
    expect((await upload(token, [{ name: 'a.png', data: png(10, 10), type: 'image/png' }], 'xyz')).status).toBe(400);
  });

  it('cada imagem enviada vira um slide do carrossel, na ordem', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const urls = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/c.jpg'];
    const created = await api('/engagement/admin/banners/bulk', { method: 'POST', token, body: { images: urls } });
    expect(created.status).toBe(201);
    const list = await api(`/engagement/banners?store=${store.slug}`);
    expect(list.body.map((b: { imageUrl: string }) => b.imageUrl)).toEqual(urls);
    expect((await api('/engagement/admin/banners/bulk', { method: 'POST', token, body: { images: [] } })).status).toBe(400);
  });

  it('a categoria guarda banner fixo (desktop e celular) e a vitrine devolve', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['catalog.write']);
    const category = await api('/catalog/categories', { method: 'POST', token, body: { name: 'Blusas', slug: 'blusas', bannerUrl: 'https://cdn.test/blusas.jpg', bannerMobileUrl: 'https://cdn.test/blusas-m.jpg' } });
    expect(category.status).toBe(201);
    const listed = (await api(`/catalog/categories?store=${store.slug}`)).body.find((c: { slug: string }) => c.slug === 'blusas');
    expect(listed).toMatchObject({ bannerUrl: 'https://cdn.test/blusas.jpg', bannerMobileUrl: 'https://cdn.test/blusas-m.jpg' });
    expect((await api(`/catalog/categories/${category.body.id}`, { method: 'PATCH', token, body: { bannerUrl: null } })).status).toBe(200);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: category.body.id } })).bannerUrl).toBeNull();
    expect((await api('/catalog/categories', { method: 'POST', token, body: { name: 'X', slug: 'x', bannerUrl: 'javascript:alert(1)' } })).status).toBe(400);
  });

  it('o produto guarda uma galeria de várias fotos e o painel filtra por categoria (com subcategorias)', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['catalog.write']);
    const blusas = (await api('/catalog/categories', { method: 'POST', token, body: { name: 'Blusas', slug: 'blusas' } })).body;
    const renda = (await api('/catalog/categories', { method: 'POST', token, body: { name: 'Renda', slug: 'renda', parentId: blusas.id } })).body;
    const photos = ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg', 'https://cdn.test/3.jpg'];
    const created = await api('/catalog/products', { method: 'POST', token, body: { name: 'Blusa de renda', slug: 'blusa-renda', sku: 'BR-1', price: 99.9, categoryIds: [renda.id], imageUrls: photos } });
    expect(created.status).toBe(201);
    const detail = await api(`/catalog/admin/products/${created.body.id}`, { token });
    expect(detail.body.images.map((i: { url: string }) => i.url)).toEqual(photos);
    expect((await api(`/catalog/products/${created.body.id}`, { method: 'PATCH', token, body: { imageUrls: [photos[2], photos[0]] } })).status).toBe(200);
    expect((await api(`/catalog/admin/products/${created.body.id}`, { token })).body.images.map((i: { url: string }) => i.url)).toEqual([photos[2], photos[0]]);
    const byParent = await api('/catalog/admin/products?category=blusas', { token });
    expect(byParent.body.items.map((p: { sku: string }) => p.sku)).toEqual(['BR-1']);
    expect((await api('/catalog/admin/products?category=casa', { token })).body.total).toBe(1);
    expect((await api('/catalog/admin/products?category=nao-existe', { token })).body.total).toBe(0);
  });
});
