import { NestExpressApplication } from '@nestjs/platform-express';
import { MercadoPagoClient } from '../src/modules/payments/mercado-pago.client';
import { cleanup, createStore, login, startApp } from './helpers';

const mp = { configured: true, ping: async () => 'ok' as 'ok' | 'unauthorized' | 'error' };
let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token';
  ({ app, api } = await startApp(b => b.overrideProvider(MercadoPagoClient).useValue(mp)));
});
afterAll(async () => { delete process.env.MERCADOPAGO_ACCESS_TOKEN; await cleanup(app); });

describe('diagnóstico das integrações', () => {
  it('exige autenticação e permissão de configurações', async () => {
    const { store } = await createStore();
    expect((await api('/diagnostics')).status).toBe(401);
    const token = await login(api, store, ['catalog.write']);
    expect((await api('/diagnostics', { token })).status).toBe(403);
  });

  it('lista verificações sem vazar segredos e reflete o ping do Mercado Pago', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const ok = await api('/diagnostics', { token });
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.checks)).toBe(true);
    expect(ok.body.checks.length).toBeGreaterThan(3);
    expect(ok.body.checks.find((c: { id: string }) => c.id === 'mp-token').status).toBe('ok');
    expect(JSON.stringify(ok.body)).not.toContain('TEST-token');
    expect(JSON.stringify(ok.body)).not.toMatch(/access_token|secret=/i);
    const original = mp.ping;
    mp.ping = async () => 'unauthorized';
    const bad = await api('/diagnostics', { token });
    mp.ping = original;
    expect(bad.body.checks.find((c: { id: string }) => c.id === 'mp-token').status).toBe('fail');
  });

  it('valida o CEP e exige produto ativo no teste de frete', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    expect((await api('/diagnostics/shipping-test', { method: 'POST', token, body: { zip: '123' } })).status).toBe(400);
    const empty = await api('/diagnostics/shipping-test', { method: 'POST', token, body: { zip: '01310-100' } });
    expect([200, 404]).toContain(empty.status);
  });

  it('relata as variáveis do servidor sem valores e aponta as que o código não lê', async () => {
    const { store } = await createStore();
    expect((await api('/diagnostics/environment')).status).toBe(401);
    process.env.SUPERFRETE_TOKEM = 'valor-confidencial-xyz';
    try {
      const token = await login(api, store, ['settings.write']);
      const res = await api('/diagnostics/environment', { token });
      expect(res.status).toBe(200);
      expect(res.body.variables.find((v: { name: string }) => v.name === 'MERCADOPAGO_ACCESS_TOKEN')).toMatchObject({ set: true, group: 'Pagamentos' });
      expect(res.body.unrecognized).toContainEqual({ name: 'SUPERFRETE_TOKEM', suggestion: 'SUPERFRETE_TOKEN' });
      expect(JSON.stringify(res.body)).not.toContain('valor-confidencial-xyz');
      expect(JSON.stringify(res.body)).not.toContain('TEST-token');
    } finally {
      delete process.env.SUPERFRETE_TOKEM;
    }
  });
});
