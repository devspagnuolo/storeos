import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('troca de senha', () => {
  it('exige a senha atual, encerra as outras sessões e devolve uma nova', async () => {
    const { store } = await createStore();
    const token = await login(api, store, []);
    const user = await prisma.user.findFirstOrThrow({ where: { storeId: store.id } });
    const other = await api('/auth/login', { method: 'POST', body: { email: user.email, password: 'senha-forte-123', storeSlug: store.slug } });

    expect((await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'errada-123456', newPassword: 'nova-senha-forte-1' } })).status).toBe(400);
    expect((await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'senha-forte-123', newPassword: 'curta' } })).status).toBe(400);
    expect((await api('/auth/password', { method: 'POST', body: { currentPassword: 'senha-forte-123', newPassword: 'nova-senha-forte-1' } })).status).toBe(401);

    const changed = await api('/auth/password', { method: 'POST', token, body: { currentPassword: 'senha-forte-123', newPassword: 'nova-senha-forte-1' } });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: other.body.refreshToken } })).status).toBe(401);
    expect((await api('/auth/refresh', { method: 'POST', body: { refreshToken: changed.body.refreshToken } })).status).toBe(200);
    const signIn = (password: string) => api('/auth/login', { method: 'POST', body: { email: user.email, password, storeSlug: store.slug } });
    expect((await signIn('senha-forte-123')).status).toBe(401);
    expect((await signIn('nova-senha-forte-1')).status).toBe(200);
  });
});

describe('dados da loja', () => {
  it('mostra o nome publicamente e só settings.write altera', async () => {
    const { store } = await createStore();
    expect((await api(`/store/public/${store.slug}`)).body).toMatchObject({ slug: store.slug, name: 'Loja Teste' });
    expect((await api('/store/public/nao-existe')).status).toBe(404);
    const viewer = await login(api, store, ['orders.read']);
    expect((await api('/store', { method: 'PATCH', token: viewer, body: { name: 'Outra' } })).status).toBe(403);
    const admin = await login(api, store, ['settings.write']);
    expect((await api('/store', { method: 'PATCH', token: admin, body: { name: ' Casa Bonita ', slug: 'hack' } })).status).toBe(400);
    const updated = await api('/store', { method: 'PATCH', token: admin, body: { name: ' Casa Bonita ' } });
    expect(updated.body).toMatchObject({ id: store.id, slug: store.slug, name: 'Casa Bonita' });
  });
});
