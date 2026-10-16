import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));
beforeEach(() => { process.env.THEME_ENGINE_PILOT_STORES = '*'; });
afterEach(() => { delete process.env.THEME_ENGINE_PILOT_STORES; });

describe('motor de temas', () => {
  it('instala, edita com controle de revisão, publica e desativa devolvendo a home ao editor', async () => {
    const { store } = await createStore(1);
    const editor = await login(api, store, ['settings.write']);

    const library = await api('/themes/library', { token: editor });
    expect(library.status).toBe(200);
    expect(library.body.length).toBeGreaterThan(0);

    const installed = await api('/themes/installations', { method: 'POST', token: editor, body: { releaseId: library.body[0].id } });
    expect(installed.status).toBe(201);
    const installationId = installed.body.installation.id as string;
    const { document, revision } = installed.body.draft;

    expect((await api(`/store/public/${store.slug}`)).body.publishedTheme).toBeNull();

    const edited = structuredClone(document);
    edited.templates.home.sections.find((s: { type: string }) => s.type === 'storeos.hero.v1').settings.title = 'Olá, vitrine nova';
    const saved = await api(`/themes/installations/${installationId}/draft`, { method: 'PATCH', token: editor, body: { revision, document: edited } });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(revision + 1);

    const stale = await api(`/themes/installations/${installationId}/draft`, { method: 'PATCH', token: editor, body: { revision, document: edited } });
    expect(stale.status).toBe(409);

    const invalid = structuredClone(edited);
    invalid.templates.home.sections.push({ id: 'x', type: 'evil.script.v1', enabled: true, settings: {}, blocks: [] });
    const rejected = await api(`/themes/installations/${installationId}/draft`, { method: 'PATCH', token: editor, body: { revision: revision + 1, document: invalid } });
    expect(rejected.status).toBe(422);

    expect((await api(`/themes/installations/${installationId}/publish`, { method: 'POST', token: editor, body: { revision } })).status).toBe(409);
    const published = await api(`/themes/installations/${installationId}/publish`, { method: 'POST', token: editor, body: { revision: revision + 1 } });
    expect(published.status).toBe(201);
    expect(published.body.version).toBe(1);

    const live = await api(`/store/public/${store.slug}`);
    expect(live.body.publishedTheme.document.templates.home.sections.some((s: { settings: { title?: string } }) => s.settings.title === 'Olá, vitrine nova')).toBe(true);

    const live2 = await api(`/store/public/${store.slug}`);
    expect(live2.body.publishedTheme.release.manifest.globalSettingsSchema).toBeUndefined();
    expect(live2.body.publishedTheme.release.manifest.displayName).toBeTruthy();

    // Reinstalar o tema ativo não pode tirá-lo do ar.
    expect((await api('/themes/installations', { method: 'POST', token: editor, body: { releaseId: library.body[0].id } })).status).toBe(201);
    expect((await api(`/store/public/${store.slug}`)).body.publishedTheme).not.toBeNull();

    const off = await api(`/themes/installations/${installationId}/deactivate`, { method: 'POST', token: editor });
    expect(off.status).toBe(201);
    expect((await api(`/store/public/${store.slug}`)).body.publishedTheme).toBeNull();
    expect((await api(`/themes/installations/${installationId}/deactivate`, { method: 'POST', token: editor })).status).toBe(404);
    expect(await prisma.themeEnginePublication.count({ where: { storeId: store.id } })).toBe(1);
  });

  it('isola lojas e exige permissão', async () => {
    const a = await createStore(1);
    const b = await createStore(1);
    const editorA = await login(api, a.store, ['settings.write']);
    const editorB = await login(api, b.store, ['settings.write']);
    const library = await api('/themes/library', { token: editorA });
    const installed = await api('/themes/installations', { method: 'POST', token: editorA, body: { releaseId: library.body[0].id } });
    const id = installed.body.installation.id as string;

    expect((await api(`/themes/installations/${id}/draft`, { token: editorB })).status).toBe(404);
    expect((await api(`/themes/installations/${id}/publish`, { method: 'POST', token: editorB, body: { revision: 1 } })).status).toBe(404);
    expect((await api(`/themes/installations/${id}/deactivate`, { method: 'POST', token: editorB })).status).toBe(404);
    expect((await api('/themes/installations', { token: editorB })).body).toEqual([]);

    const noPerm = await login(api, a.store, ['catalog.write']);
    expect((await api('/themes/library', { token: noPerm })).status).toBe(403);
    expect((await api('/themes/installations', { method: 'POST', token: noPerm, body: { releaseId: library.body[0].id } })).status).toBe(403);
  });

  it('fora da loja piloto: instalar não mexe na loja publicada e publicar fica bloqueado', async () => {
    const { store } = await createStore(1);
    const editor = await login(api, store, ['settings.write']);
    const before = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    const library = await api('/themes/library', { token: editor });
    const installed = await api('/themes/installations', { method: 'POST', token: editor, body: { releaseId: library.body[0].id } });
    const installationId = installed.body.installation.id as string;
    const after = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(after.themeConfig).toEqual(before.themeConfig);
    expect(after.draftThemeConfig).toEqual(before.draftThemeConfig);
    expect(after.storefrontVersion).toBe(before.storefrontVersion);
    expect(installed.body.installation.status).toBe('INACTIVE');

    process.env.THEME_ENGINE_PILOT_STORES = 'outra-loja';
    const status = await api('/themes/status', { token: editor });
    expect(status.body.publishEnabled).toBe(false);
    expect(status.body.templates.every((t: { controlledBy: string }) => t.controlledBy === 'editor')).toBe(true);
    const blocked = await api(`/themes/installations/${installationId}/publish`, { method: 'POST', token: editor, body: { revision: installed.body.draft.revision } });
    expect(blocked.status).toBe(403);
    expect(await prisma.themeEnginePublication.count({ where: { storeId: store.id } })).toBe(0);

    // Com a loja na lista piloto publica; ao tirá-la da lista a vitrine volta ao editor sem apagar nada.
    process.env.THEME_ENGINE_PILOT_STORES = store.slug;
    expect((await api(`/themes/installations/${installationId}/publish`, { method: 'POST', token: editor, body: { revision: installed.body.draft.revision } })).status).toBe(201);
    expect((await api(`/store/public/${store.slug}`)).body.publishedTheme).not.toBeNull();
    const live = await api('/themes/status', { token: editor });
    expect(live.body.active.live).toBe(true);
    expect(live.body.templates.find((t: { pageType: string }) => t.pageType === 'home').controlledBy).toBe('engine');
    expect(live.body.templates.find((t: { pageType: string }) => t.pageType === 'product').controlledBy).toBe('engine');

    process.env.THEME_ENGINE_PILOT_STORES = '';
    expect((await api(`/store/public/${store.slug}`)).body.publishedTheme).toBeNull();
    expect((await api(`/store/public/${store.slug}`)).body.themeConfig).toEqual(before.themeConfig);
    expect((await prisma.themeInstallation.findUniqueOrThrow({ where: { id: installationId } })).status).toBe('ACTIVE');
  });
});
