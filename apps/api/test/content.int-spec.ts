import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('páginas institucionais', () => {
  it('só publica o que o lojista liberou, edita, remove e isola por loja', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['settings.write']);

    const draft = await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'trocas', title: 'Trocas e devoluções', body: 'Aceitamos trocas em até 7 dias.' } });
    expect(draft.status).toBe(201);
    expect((await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'trocas', title: 'Outra', body: 'x' } })).status).toBe(409);
    expect((await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'Inválida!', title: 'Ruim', body: 'x' } })).status).toBe(400);

    // Rascunho não aparece para o público.
    expect((await api(`/content/pages/trocas?store=${store.slug}`)).status).toBe(404);
    expect((await api(`/content/pages?store=${store.slug}`)).body).toEqual([]);

    await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: admin, body: { published: true, title: 'Trocas e devoluções (CDC)' } });
    const page = await api(`/content/pages/trocas?store=${store.slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ title: 'Trocas e devoluções (CDC)', body: 'Aceitamos trocas em até 7 dias.' });
    expect((await api(`/content/pages?store=${store.slug}`)).body).toEqual([{ slug: 'trocas', title: 'Trocas e devoluções (CDC)', showInFooter: true }]);

    // Outra loja não vê nem edita.
    expect((await api(`/content/pages/trocas?store=${other.store.slug}`)).status).toBe(404);
    const outsider = await login(api, other.store, ['settings.write']);
    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: outsider, body: { title: 'Invadida' } })).status).toBe(404);
    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'DELETE', token: outsider })).status).toBe(404);
    expect((await api('/content/admin/pages', { token: await login(api, store, ['orders.read']) })).status).toBe(403);

    expect((await api(`/content/admin/pages/${draft.body.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect((await api(`/content/pages/trocas?store=${store.slug}`)).status).toBe(404);
  });

  it('blog: artigos ficam fora das páginas, ordenam pela primeira publicação e só aparecem publicados', async () => {
    const { store } = await createStore();
    const admin = await login(api, store, ['settings.write']);
    const create = (slug: string, published: boolean) => api('/content/admin/pages', { method: 'POST', token: admin, body: {
      slug, title: `Artigo ${slug}`, body: 'Texto do artigo.', kind: 'POST', published, excerpt: 'Resumo', authorName: 'Equipe', coverImageUrl: 'https://cdn.exemplo.com/capa.jpg',
    } });
    const first = await create('primeiro', true);
    expect(first.status).toBe(201);
    expect(first.body.publishedAt).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    const draft = await create('segundo', false);
    expect(draft.body.publishedAt).toBeNull();
    expect((await api('/content/admin/pages', { method: 'POST', token: admin, body: { slug: 'x', title: 'Capa ruim', body: 'x', kind: 'POST', coverImageUrl: 'javascript:alert(1)' } })).status).toBe(400);

    // Artigo não é página institucional: fora de /content/pages e do rodapé.
    expect((await api(`/content/pages?store=${store.slug}`)).body).toEqual([]);
    expect((await api(`/content/pages/primeiro?store=${store.slug}`)).status).toBe(404);
    expect((await api(`/content/posts/segundo?store=${store.slug}`)).status).toBe(404);

    const before = await api(`/content/posts?store=${store.slug}`);
    expect(before.body).toMatchObject({ total: 1, items: [{ slug: 'primeiro', excerpt: 'Resumo', authorName: 'Equipe' }] });

    await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: admin, body: { published: true } });
    const after = await api(`/content/posts?store=${store.slug}&limit=1`);
    expect(after.body.total).toBe(2);
    expect(after.body.items.map((post: { slug: string }) => post.slug)).toEqual(['segundo']);
    const post = await api(`/content/posts/segundo?store=${store.slug}`);
    expect(post.body).toMatchObject({ title: 'Artigo segundo', body: 'Texto do artigo.' });

    // Editar de novo não muda a data de publicação.
    const publishedAt = post.body.publishedAt;
    await api(`/content/admin/pages/${draft.body.id}`, { method: 'PATCH', token: admin, body: { title: 'Artigo segundo editado', published: true } });
    expect((await api(`/content/posts/segundo?store=${store.slug}`)).body.publishedAt).toBe(publishedAt);

    const adminPosts = await api('/content/admin/pages?kind=POST', { token: admin });
    expect(adminPosts.body).toHaveLength(2);
    expect((await api('/content/admin/pages', { token: admin })).body).toHaveLength(0);
  });
});
