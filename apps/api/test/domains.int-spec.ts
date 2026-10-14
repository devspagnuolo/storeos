import { NestExpressApplication } from '@nestjs/platform-express';
import { DnsResolver, TlsProbe } from '../src/modules/store/domain-probes';
import { cleanup, createStore, login, startApp } from './helpers';

const dnsState = { txt: new Map<string, string[]>(), cname: new Map<string, string[]>(), a: new Map<string, string[]>() };
const tlsState = { ok: false, error: undefined as string | undefined };
class FakeDns { txt = async (n: string) => dnsState.txt.get(n) ?? []; cname = async (n: string) => dnsState.cname.get(n) ?? []; a = async (n: string) => dnsState.a.get(n) ?? []; }
class FakeTls { check = async () => ({ ok: tlsState.ok, error: tlsState.error, validUntil: new Date('2027-01-01') }); }

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
beforeAll(async () => {
  process.env.STOREOS_CNAME_TARGET = 'storeos-web.exemplo.com';
  ({ app, api } = await startApp(b => b.overrideProvider(DnsResolver).useValue(new FakeDns()).overrideProvider(TlsProbe).useValue(new FakeTls())));
});
afterAll(() => cleanup(app));

describe('domínio próprio', () => {
  it('guia DNS → verifica posse e apontamento → exige HTTPS → ativa e define principal', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    const host = `www.${store.slug}.com.br`;
    const added = await api('/store/domains', { method: 'POST', token, body: { hostname: `HTTPS://${host.toUpperCase()}/` } });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ hostname: host, status: 'PENDING_DNS', isPrimary: false });
    expect(added.body).not.toHaveProperty('verificationToken');
    const txtRecord = added.body.records.find((r: { type: string }) => r.type === 'TXT');
    expect(txtRecord.name).toBe(`_storeos-challenge.${host}`);
    expect(added.body.records.find((r: { type: string }) => r.type === 'CNAME').value).toBe('storeos-web.exemplo.com');

    const id = added.body.id;
    expect((await api(`/store/domains/${id}/verify`, { method: 'POST', token })).body).toMatchObject({ status: 'PENDING_DNS', checks: { txt: false } });
    expect((await api(`/store/domains/${id}/primary`, { method: 'POST', token })).status).toBe(400);

    dnsState.txt.set(txtRecord.name, ['outro-valor']);
    dnsState.cname.set(host, ['storeos-web.exemplo.com']);
    expect((await api(`/store/domains/${id}/verify`, { method: 'POST', token })).body.checks.txt).toBe(false); // token errado não vale

    dnsState.txt.set(txtRecord.name, [txtRecord.value]);
    tlsState.error = 'Certificado ainda não emitido';
    const dnsOnly = (await api(`/store/domains/${id}/verify`, { method: 'POST', token })).body;
    expect(dnsOnly).toMatchObject({ status: 'DNS_VERIFIED', checks: { txt: true, routing: true, tls: false } });
    expect(dnsOnly.lastError).toBe('Certificado ainda não emitido');
    expect((await api(`/store/by-host?host=${host}`)).status).toBe(404); // ainda não atende

    tlsState.ok = true;
    expect((await api(`/store/domains/${id}/verify`, { method: 'POST', token })).body).toMatchObject({ status: 'ACTIVE', lastError: null });
    expect((await api(`/store/by-host?host=${host}`)).body).toEqual({ slug: store.slug, hostname: host });
    expect((await api(`/store/domains/${id}/primary`, { method: 'POST', token })).body.domains[0].isPrimary).toBe(true);
    expect((await api(`/store/public/${store.slug}`)).body.primaryDomain).toBe(host);

    dnsState.cname.delete(host); // o cliente mexeu no DNS: perde o status ativo e o principal
    expect((await api(`/store/domains/${id}/verify`, { method: 'POST', token })).body).toMatchObject({ status: 'PENDING_DNS', isPrimary: false });
    expect((await api(`/store/public/${store.slug}`)).body.primaryDomain).toBeNull();
  });

  it('recusa domínio inválido, duplicado e de outra loja; isola por loja e permissão', async () => {
    const first = await createStore();
    const second = await createStore();
    const token = await login(api, first.store, ['settings.write']);
    const other = await login(api, second.store, ['settings.write']);
    const denied = await login(api, first.store, ['catalog.write']);
    const host = `loja-${first.store.slug}.com.br`;
    for (const bad of ['localhost', '10.0.0.1', 'loja.com/x', 'meu.onrender.com']) {
      expect((await api('/store/domains', { method: 'POST', token, body: { hostname: bad } })).status).toBe(400);
    }
    const created = await api('/store/domains', { method: 'POST', token, body: { hostname: host } });
    expect(created.status).toBe(201);
    expect((await api('/store/domains', { method: 'POST', token, body: { hostname: host } })).status).toBe(409);
    expect((await api('/store/domains', { method: 'POST', token: other, body: { hostname: host } })).status).toBe(409);
    expect((await api(`/store/domains/${created.body.id}/verify`, { method: 'POST', token: other })).status).toBe(404);
    expect((await api(`/store/domains/${created.body.id}`, { method: 'DELETE', token: other })).status).toBe(404);
    expect((await api('/store/domains', { token: denied })).status).toBe(403);
    expect((await api('/store/domains')).status).toBe(401);
    expect((await api('/store/domains', { token: other })).body.domains).toHaveLength(0);
    expect((await api(`/store/domains/${created.body.id}`, { method: 'DELETE', token })).body.domains).toHaveLength(0);
  });

  it('limita a 5 domínios por loja', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write']);
    for (let i = 0; i < 5; i++) expect((await api('/store/domains', { method: 'POST', token, body: { hostname: `d${i}-${store.slug}.com.br` } })).status).toBe(201);
    expect((await api('/store/domains', { method: 'POST', token, body: { hostname: `d9-${store.slug}.com.br` } })).status).toBe(400);
  });
});
