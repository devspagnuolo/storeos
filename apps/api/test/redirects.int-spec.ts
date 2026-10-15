import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let base: string;

beforeAll(async () => {
  ({ app, api } = await startApp());
  base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api/v1`;
});
afterAll(() => cleanup(app));

describe('redirecionamentos 301', () => {
  it('cadastra, protege, resolve por loja e domínio, importa planilha e gera os da Nuvemshop', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['catalog.write']);
    expect((await api('/redirects', { token: await login(api, store, ['orders.read']) })).status).toBe(403);

    const created = await api('/redirects', { method: 'POST', token: admin, body: { from: 'https://antiga.com.br/Produtos/Vaso-Azul/?ref=1', to: 'produto/vaso' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ fromPath: '/produtos/vaso-azul', toPath: '/produto/vaso' });
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/produtos/vaso-azul', to: '/x' } })).status).toBe(409);
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/painel/pedidos', to: '/x' } })).status).toBe(400);
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/a', to: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/produto/vaso', to: '/outro' } })).status).toBe(400);

    // Laço: /b -> /a depois de /a -> /b
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/a', to: '/b' } })).status).toBe(201);
    expect((await api('/redirects', { method: 'POST', token: admin, body: { from: '/b', to: '/a' } })).status).toBe(400);

    // A vitrine resolve pelo caminho (com maiúsculas e barra final) e conta o acesso.
    const hit = await api(`/redirects/resolve?store=${store.slug}&path=${encodeURIComponent('/Produtos/Vaso-Azul/')}`);
    expect(hit.body).toEqual({ to: '/produto/vaso', status: 301 });
    expect((await api(`/redirects/resolve?store=${other.store.slug}&path=/produtos/vaso-azul`)).status).toBe(404);
    expect((await api(`/redirects/resolve?store=${store.slug}&path=/nao-existe`)).status).toBe(404);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect((await prisma.redirect.findFirstOrThrow({ where: { storeId: store.id, fromPath: '/produtos/vaso-azul' } })).hits).toBe(1);

    // Domínio ativo da loja tem prioridade sobre o parâmetro de loja.
    await prisma.storeDomain.create({ data: { storeId: store.id, hostname: `${store.slug}.com.br`, status: 'ACTIVE', verificationToken: 'x' } });
    expect((await api(`/redirects/resolve?store=${other.store.slug}&host=${store.slug}.com.br&path=/a`)).body.to).toBe('/b');

    // Planilha: duas boas, uma repetida, uma proibida.
    const csv = 'antigo,novo\n/produtos/camisa,/produto/camisa\n/categoria/saias,/categorias/saias\n/produtos/vaso-azul,/produto/vaso\n/carrinho,/outra\n';
    const imported = await fetch(`${base}/redirects/import`, { method: 'POST', headers: { 'content-type': 'text/csv', authorization: `Bearer ${admin}` }, body: csv });
    const result = await imported.json();
    expect(result.created).toBe(2);
    expect(result.skipped.map((s: { line: number }) => s.line)).toEqual([4, 5]);

    // Padrão Nuvemshop: o produto ativo e a categoria da loja de teste.
    const generated = await api('/redirects/nuvemshop', { method: 'POST', token: admin, body: {} });
    expect(generated.body.created).toBe(2);
    const paths = (await api('/redirects', { token: admin })).body.items.map((r: { fromPath: string }) => r.fromPath);
    expect(paths).toEqual(expect.arrayContaining(['/produtos/vaso', '/casa']));
    expect((await api('/redirects/nuvemshop', { method: 'POST', token: admin, body: {} })).body.created).toBe(0);

    // Editar destino e apagar.
    expect((await api(`/redirects/${created.body.id}`, { method: 'PATCH', token: admin, body: { to: '/categorias/casa' } })).body.toPath).toBe('/categorias/casa');
    expect((await api(`/redirects/${created.body.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api(`/redirects/${created.body.id}`, { method: 'DELETE', token: admin })).status).toBe(404);
  });
});
