import { buildChecks, Facts, summarize } from './diagnostics-rules';

const healthy: Facts = {
  apiPublicUrl: 'https://api.loja.com', webOrigin: 'https://loja.com', dbOk: true, outboxPending: 0, outboxOldestMinutes: null,
  mp: { token: true, webhookSecret: true, publicKey: true, ping: 'ok' },
  carrier: { enabled: true, provider: 'superfrete', originZip: '01310100' }, shippingRules: 0, email: { resend: true, from: true },
  bling: { appConfigured: true, connected: true, lastError: null, tokenExpired: false, companyLinked: true, failedOrders: 0 }, failedPayments24h: 0,
};
const status = (facts: Facts, id: string) => buildChecks(facts).find(c => c.id === id)?.status;

describe('diagnóstico das integrações', () => {
  it('ambiente saudável não tem falhas nem avisos além do backup manual', () => {
    const checks = buildChecks(healthy);
    expect(summarize(checks)).toMatchObject({ fail: 0, warn: 0 });
    expect(checks.find(c => c.id === 'backups')?.status).toBe('manual');
  });
  it.each([
    ['API sem https', { apiPublicUrl: 'http://x' }, 'api-url', 'fail'],
    ['banco fora', { dbOk: false }, 'db', 'fail'],
    ['fila parada', { outboxPending: 3, outboxOldestMinutes: 30 }, 'outbox', 'fail'],
    ['fila andando', { outboxPending: 3, outboxOldestMinutes: 1 }, 'outbox', 'warn'],
    ['token do MP recusado', { mp: { ...healthy.mp, ping: 'unauthorized' as const } }, 'mp-token', 'fail'],
    ['MP sem segredo de webhook', { mp: { ...healthy.mp, webhookSecret: false } }, 'mp-webhook', 'fail'],
    ['cartão sem chave pública', { mp: { ...healthy.mp, publicKey: false } }, 'card', 'off'],
    ['sem frete nenhum', { carrier: { enabled: false, originZip: null }, shippingRules: 0 }, 'carrier', 'fail'],
    ['só regras próprias', { carrier: { enabled: false, originZip: null }, shippingRules: 2 }, 'carrier', 'off'],
    ['e-mail simulado', { email: { resend: false, from: false } }, 'email', 'warn'],
    ['Bling com erro', { bling: { ...healthy.bling, lastError: 'invalid_token' } }, 'bling', 'fail'],
    ['Bling com pedidos falhos', { bling: { ...healthy.bling, failedOrders: 2 } }, 'bling', 'warn'],
  ])('%s', (_, patch, id, expected) => {
    expect(status({ ...healthy, ...patch } as Facts, id)).toBe(expected);
  });
  it('não vaza segredos nos textos', () => {
    expect(JSON.stringify(buildChecks({ ...healthy, bling: { ...healthy.bling, lastError: 'x' } }))).not.toMatch(/token":|secret":/i);
  });
});
