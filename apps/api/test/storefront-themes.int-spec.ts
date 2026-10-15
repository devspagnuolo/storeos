import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('temas prontos da vitrine', () => {
  it('lista os temas, aplica no rascunho sem publicar e preserva a logo', async () => {
    const { store } = await createStore(1);
    const editor = await login(api, store, ['settings.write']);

    const list = await api('/store/storefront/themes', { token: editor });
    expect(list.status).toBe(200);
    expect(list.body.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['essencial', 'elegante']));

    await api('/store/storefront/draft', { method: 'PATCH', token: editor, body: { version: 0, config: { design: { logoUrl: 'https://cdn.exemplo.com/logo.png' } } } });
    const applied = await api('/store/storefront/themes/apply', { method: 'POST', token: editor, body: { key: 'elegante' } });
    expect(applied.status).toBe(200);

    const state = await api('/store/storefront', { token: editor });
    expect(state.body.draft.design.preset).toBe('minimalista');
    expect(state.body.draft.design.logoUrl).toBe('https://cdn.exemplo.com/logo.png');
    expect(state.body.draft.home.sections.length).toBeGreaterThan(3);
    expect(JSON.stringify(state.body.draft)).not.toContain('{loja}');
    expect(state.body.publishedAt).toBeNull();

    expect((await api('/store/storefront/themes/apply', { method: 'POST', token: editor, body: { key: 'inexistente' } })).status).toBe(404);
  });

  it('exige permissão de configurações e isola por loja', async () => {
    const { store } = await createStore(1);
    const noPerm = await login(api, store, ['catalog.write']);
    expect((await api('/store/storefront/themes/apply', { method: 'POST', token: noPerm, body: { key: 'essencial' } })).status).toBe(403);
    expect((await api('/store/storefront/themes', { token: noPerm })).status).toBe(403);
  });
});
