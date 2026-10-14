import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('trilha de auditoria', () => {
  it('registra a alteração com autor e alvo, sem gravar segredos, e só o dono da loja enxerga', async () => {
    const { store } = await createStore();
    const other = await createStore();
    const admin = await login(api, store, ['settings.write', 'audit.read']);
    const outsider = await login(api, other.store, ['audit.read']);

    const created = await api('/shipping/rules', { method: 'POST', token: admin, body: { name: 'Expresso', states: ['SP'], price: 12, minDays: 1, maxDays: 2, position: 0 } });
    expect(created.status).toBe(201);
    // Senha errada: a tentativa vira FAILURE e a senha informada não pode aparecer.
    const wrong = await api('/auth/password', { method: 'POST', token: admin, body: { currentPassword: 'senha-errada-999', newPassword: 'outra-senha-forte-1' } });
    expect(wrong.status).toBe(400);

    const log = await api('/audit?pageSize=50', { token: admin });
    expect(log.status).toBe(200);
    const rule = log.body.items.find((item: { action: string }) => item.action === 'POST /shipping/rules');
    expect(rule).toMatchObject({ outcome: 'SUCCESS', statusCode: 201, entity: 'shipping', storeId: store.id, actor: { name: 'Admin' } });
    expect(rule.metadata.body).toMatchObject({ name: 'Expresso', price: 12 });
    const password = log.body.items.find((item: { action: string }) => item.action === 'POST /auth/password');
    expect(password).toMatchObject({ outcome: 'FAILURE', statusCode: 400 });
    expect(JSON.stringify(password.metadata)).not.toContain('senha-errada-999');
    expect(password.metadata.body).toMatchObject({ currentPassword: '[oculto]', newPassword: '[oculto]' });

    // Outra loja não enxerga nada desta.
    const foreign = await api('/audit?pageSize=50', { token: outsider });
    expect(foreign.body.items.every((item: { storeId: string }) => item.storeId === other.store.id)).toBe(true);
    const filtered = await api('/audit?outcome=FAILURE&entity=auth', { token: admin });
    expect(filtered.body.items.length).toBeGreaterThanOrEqual(1);
    expect(filtered.body.items.every((item: { outcome: string }) => item.outcome === 'FAILURE')).toBe(true);
  });

  it('exige audit.read e registra tentativa negada', async () => {
    const { store } = await createStore();
    const viewer = await login(api, store, ['settings.write']);
    expect((await api('/audit', { token: viewer })).status).toBe(403);
    expect((await api('/audit')).status).toBe(401);
    // PATCH negado por falta de permissão: quem tem token válido deixa rastro como DENIED.
    const orderViewer = await login(api, store, ['orders.read']);
    expect((await api('/store', { method: 'PATCH', token: orderViewer, body: { name: 'Hack' } })).status).toBe(403);
    const reader = await login(api, store, ['audit.read']);
    const denied = await api('/audit?outcome=DENIED', { token: reader });
    expect(denied.body.items.some((item: { action: string }) => item.action === 'PATCH /store')).toBe(true);
  });

  it('registra login com sucesso e login recusado', async () => {
    const { store } = await createStore();
    const reader = await login(api, store, ['audit.read']);
    const refused = await api('/auth/login', { method: 'POST', body: { email: 'ninguem@example.com', password: 'qualquer-senha-123', storeSlug: store.slug } });
    expect(refused.status).toBe(401);
    const log = await api('/audit?action=auth.login&pageSize=50', { token: reader });
    expect(log.body.items.some((item: { outcome: string; metadata?: { email?: string } }) => item.outcome === 'DENIED' && item.metadata?.email === 'ninguem@example.com')).toBe(true);
    expect(log.body.items.some((item: { outcome: string }) => item.outcome === 'SUCCESS')).toBe(true);
    expect(JSON.stringify(log.body)).not.toContain('qualquer-senha-123');
  });

  it('é imutável: o banco recusa alterar ou apagar registros', async () => {
    const { store } = await createStore();
    const reader = await login(api, store, ['audit.read']);
    expect((await api('/store', { method: 'PATCH', token: reader, body: { name: 'X' } })).status).toBe(403);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { storeId: store.id } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { outcome: 'SUCCESS' } })).rejects.toThrow(/imutável/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/imutável/);
  });
});
