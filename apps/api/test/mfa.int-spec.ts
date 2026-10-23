import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { currentStep, totpAt } from '../src/shared/auth/totp';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

async function adminWithPassword() {
  const { store } = await createStore();
  const email = `mfa-${randomUUID().slice(0, 8)}@example.com`;
  await prisma.user.create({ data: { storeId: store.id, email, name: 'Admin', passwordHash: await argon2.hash('senha-forte-123') } });
  const body = { email, password: 'senha-forte-123', storeSlug: store.slug };
  const session = await api('/auth/login', { method: 'POST', body });
  return { store, body, token: session.body.accessToken as string };
}

describe('verificação em duas etapas e sessões', () => {
  it('ativa o MFA, exige código no login, recusa replay e aceita código de recuperação uma vez', async () => {
    const { body, token } = await adminWithPassword();
    const setup = await api('/auth/mfa/setup', { method: 'POST', token });
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    expect((await api('/auth/mfa/enable', { method: 'POST', token, body: { code: '000000' } })).status).toBe(400);
    // O passo atual é consumido na ativação; o login usa o próximo passo válido.
    // Guardado uma vez: se a virada dos 30 s cair no meio do teste, o replay continua sendo do mesmo passo.
    const step = currentStep();
    const enabled = await api('/auth/mfa/enable', { method: 'POST', token, body: { code: totpAt(setup.body.secret, step) } });
    expect(enabled.status).toBe(200);
    expect(enabled.body.recoveryCodes).toHaveLength(8);
    expect((await api('/auth/mfa', { token })).body).toEqual({ enabled: true, recoveryCodesLeft: 8 });

    const missing = await api('/auth/login', { method: 'POST', body });
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('MFA_REQUIRED');
    expect((await api('/auth/login', { method: 'POST', body: { ...body, code: '123456' } })).body.code).toBe('MFA_INVALID');
    // Replay do mesmo passo usado na ativação é recusado.
    expect((await api('/auth/login', { method: 'POST', body: { ...body, code: totpAt(setup.body.secret, step) } })).status).toBe(401);
    const ok = await api('/auth/login', { method: 'POST', body: { ...body, code: totpAt(setup.body.secret, step + 1) } });
    expect(ok.status).toBe(200);

    const recovery = enabled.body.recoveryCodes[0] as string;
    expect((await api('/auth/login', { method: 'POST', body: { ...body, code: recovery } })).status).toBe(200);
    expect((await api('/auth/login', { method: 'POST', body: { ...body, code: recovery } })).status).toBe(401);
    expect((await api('/auth/mfa', { token })).body.recoveryCodesLeft).toBe(7);

    // Segredo nunca volta em claro nem aparece no banco.
    const stored = await prisma.user.findFirstOrThrow({ where: { email: body.email } });
    expect(stored.mfaSecretEnc).not.toContain(setup.body.secret);
  });

  it('desativar exige senha e código válidos', async () => {
    const { body, token } = await adminWithPassword();
    const setup = await api('/auth/mfa/setup', { method: 'POST', token });
    await api('/auth/mfa/enable', { method: 'POST', token, body: { code: totpAt(setup.body.secret, currentStep()) } });
    expect((await api('/auth/mfa/disable', { method: 'POST', token, body: { password: 'errada-errada', code: totpAt(setup.body.secret, currentStep() + 1) } })).status).toBe(400);
    expect((await api('/auth/mfa/disable', { method: 'POST', token, body: { password: body.password, code: totpAt(setup.body.secret, currentStep() + 1) } })).status).toBe(200);
    expect((await api('/auth/login', { method: 'POST', body })).status).toBe(200);
  });

  it('lista e encerra sessões do próprio usuário', async () => {
    const { store, body, token } = await adminWithPassword();
    await api('/auth/login', { method: 'POST', body, headers: { 'user-agent': 'Navegador B' } });
    const list = await api('/auth/sessions', { token });
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
    expect(list.body.some((s: { userAgent: string }) => s.userAgent === 'Navegador B')).toBe(true);
    expect((await api(`/auth/sessions/${list.body[0].id}`, { method: 'DELETE', token })).status).toBe(204);
    expect((await api('/auth/sessions', { token })).body.length).toBe(1);
    // Sessão de outro usuário não pode ser encerrada.
    const other = await login(api, store, ['orders.read']);
    expect((await api(`/auth/sessions/${list.body[1].id}`, { method: 'DELETE', token: other })).status).toBe(404);
    expect((await api('/auth/sessions', { method: 'DELETE', token })).body.revoked).toBe(1);
  });

  it('bloqueia a conta depois de 10 senhas erradas, mesmo com a senha certa, e libera quando o prazo passa', async () => {
    const { body } = await adminWithPassword();
    for (let i = 0; i < 9; i++) expect((await api('/auth/login', { method: 'POST', body: { ...body, password: 'senha-errada-' + i } })).status).toBe(401);
    // Acerto antes do limite zera a contagem.
    expect((await api('/auth/login', { method: 'POST', body })).status).toBe(200);
    for (let i = 0; i < 10; i++) await api('/auth/login', { method: 'POST', body: { ...body, password: 'senha-errada-' + i } });
    const locked = await api('/auth/login', { method: 'POST', body });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    const user = await prisma.user.findFirstOrThrow({ where: { email: body.email } });
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await api('/auth/login', { method: 'POST', body })).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });
});
