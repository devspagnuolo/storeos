import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

beforeAll(async () => {
  ({ app, api } = await startApp());
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(() => cleanup(app));

const csv = [
  'Identificador URL;Nome;Categorias;Nome da variação 1;Valor da variação 1;Nome da variação 2;Valor da variação 2;Preço;Preço promocional;Peso (kg);Estoque;SKU;Exibir na loja;Marca;Imagens',
  'blusa-ciganinha;Blusa Ciganinha;"Blusas > Regatas";Cor;Preto;Tamanho;G1;"89,90";"69,90";0,3;4;BL-P-G1;SIM;Vivi;https://img.example/a.jpg https://img.example/b.jpg',
  'blusa-ciganinha;;;Cor;Preto;Tamanho;G2;"89,90";;;2;BL-P-G2;SIM;;',
  'cinto-fino;Cinto Fino;Acessórios;;;;;"39,90";;;12;CINTO-1;NÃO;;',
  'sem-preco;Sem Preço;;;;;;;;;1;SP-1;SIM;;',
].join('\r\n');

const send = (token: string, path: string, body: string) => fetch(`${baseUrl}/api/v1${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/csv' }, body });

describe('importação e exportação de produtos', () => {
  it('confere sem gravar, importa com categorias, marca, variações e estoque, e reimportar atualiza', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['catalog.write']);

    const dry = await (await send(admin, '/catalog/products/import?dryRun=true', csv)).json();
    expect(dry).toMatchObject({ dryRun: true, rows: 4, created: 2, updated: 0, failed: 1 });
    expect(dry.errors[0].message).toContain('sem preço');
    expect(await prisma.product.count({ where: { storeId: store.id, slug: 'blusa-ciganinha' } })).toBe(0);

    const done = await (await send(admin, '/catalog/products/import', csv)).json();
    expect(done).toMatchObject({ dryRun: false, created: 2, updated: 0, failed: 1 });

    const blusa = await prisma.product.findFirstOrThrow({ where: { storeId: store.id, slug: 'blusa-ciganinha' }, include: { variants: { orderBy: { position: 'asc' } }, images: true, categories: { include: { category: true } }, brand: true, inventory: true } });
    expect(blusa).toMatchObject({ status: 'ACTIVE', weightGrams: 300, brand: { name: 'Vivi' } });
    expect(Number(blusa.price)).toBe(69.9);
    expect(blusa.variants.map(v => v.sku)).toEqual(['BL-P-G1', 'BL-P-G2']);
    expect(blusa.inventory.map(i => i.quantity).sort()).toEqual([2, 4]);
    expect(blusa.images.map(i => i.url).sort()).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg']);
    expect(blusa.categories.map(c => c.category.slug).sort()).toEqual(['blusas', 'regatas']);
    expect((await prisma.category.findFirstOrThrow({ where: { storeId: store.id, slug: 'regatas' } })).parentId).toBeTruthy();
    const cinto = await prisma.product.findFirstOrThrow({ where: { storeId: store.id, slug: 'cinto-fino' }, include: { inventory: true } });
    expect(cinto).toMatchObject({ status: 'DRAFT', sku: 'CINTO-1' });
    expect(cinto.inventory[0].quantity).toBe(12);

    // Reimportar com preço e estoque novos atualiza, sem duplicar produto, variação nem imagens.
    const again = await (await send(admin, '/catalog/products/import', csv.replace('"39,90"', '"44,90"').replace(';12;CINTO-1', ';20;CINTO-1').replace(';4;BL-P-G1', ';9;BL-P-G1'))).json();
    expect(again).toMatchObject({ created: 0, updated: 2 });
    expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(4); // 2 da loja de teste + 2 importados
    expect(await prisma.productVariant.count({ where: { productId: blusa.id } })).toBe(2);
    expect(await prisma.productImage.count({ where: { productId: blusa.id } })).toBe(2);
    expect((await prisma.inventory.findFirstOrThrow({ where: { productId: blusa.id, variant: { sku: 'BL-P-G1' } } })).quantity).toBe(9);
    expect(Number((await prisma.product.findFirstOrThrow({ where: { id: cinto.id } })).price)).toBe(44.9);

    // A exportação sai no mesmo formato e pode ser lida de volta.
    const exported = await fetch(`${baseUrl}/api/v1/catalog/admin/export.csv`, { headers: { authorization: `Bearer ${admin}` } });
    expect(exported.headers.get('content-type')).toContain('text/csv');
    const text = await exported.text();
    expect(text).toContain('blusa-ciganinha;Blusa Ciganinha;Blusas, Blusas > Regatas');
    const roundTrip = await (await send(admin, '/catalog/products/import?dryRun=true', text)).json();
    expect(roundTrip).toMatchObject({ created: 0, updated: 4, failed: 0 });
  });

  it('isola lojas, valida o envio e exige permissão', async () => {
    const { store } = await createStore();
    const reader = await login(api, store, ['orders.read']);
    expect((await send(reader, '/catalog/products/import', csv)).status).toBe(403);
    const admin = await login(api, store, ['catalog.write']);
    expect((await send(admin, '/catalog/products/import', 'Preço\n10')).status).toBe(200);
    const empty = await fetch(`${baseUrl}/api/v1/catalog/products/import`, { method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'text/csv' }, body: '' });
    expect(empty.status).toBe(400);
    expect((await send(admin, '/catalog/products/import?dryRun=talvez', csv)).status).toBe(400);
  });
});
