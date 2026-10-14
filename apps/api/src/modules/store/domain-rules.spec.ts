import { BadRequestException } from '@nestjs/common';
import { dnsInstructions, explain, isApex, normalizeHostname, resolveStatus } from './domain-rules';

describe('regras de domínio', () => {
  it('normaliza e aceita domínios válidos', () => {
    expect(normalizeHostname(' HTTPS://WWW.ViviModa.com.br/ ')).toBe('www.vivimoda.com.br');
    expect(normalizeHostname('loja.com')).toBe('loja.com');
  });
  it.each(['', 'localhost', '192.168.0.1', 'loja', 'a_b.com', 'loja.com:8080', 'loja.com/produto', 'user@loja.com', 'x.onrender.com', '-a.com', 'a..com', 'loja.c0m'])('recusa %p', input => {
    expect(() => normalizeHostname(input)).toThrow(BadRequestException);
  });
  it('distingue raiz de subdomínio e monta as instruções de DNS', () => {
    expect(isApex('loja.com.br')).toBe(true);
    expect(isApex('www.loja.com.br')).toBe(false);
    expect(isApex('loja.com')).toBe(true);
    const www = dnsInstructions('www.loja.com.br', 'tok', { cnameTarget: 'app.exemplo.com', edgeIps: [] });
    expect(www).toEqual([expect.objectContaining({ type: 'TXT', name: '_storeos-challenge.www.loja.com.br', value: 'tok' }), expect.objectContaining({ type: 'CNAME', value: 'app.exemplo.com' })]);
    const root = dnsInstructions('loja.com.br', 'tok', { cnameTarget: 'app.exemplo.com', edgeIps: ['1.2.3.4'] });
    expect(root.map(r => r.type)).toEqual(['TXT', 'A']);
  });
  it('só fica ativo com posse, roteamento e HTTPS', () => {
    expect(resolveStatus({ txt: false, routing: true, tls: true })).toBe('PENDING_DNS');
    expect(resolveStatus({ txt: true, routing: false, tls: true })).toBe('PENDING_DNS');
    expect(resolveStatus({ txt: true, routing: true, tls: false })).toBe('DNS_VERIFIED');
    expect(resolveStatus({ txt: true, routing: true, tls: true })).toBe('ACTIVE');
    expect(explain({ txt: true, routing: true, tls: true })).toBeNull();
    expect(explain({ txt: false, routing: false, tls: false })).toMatch(/TXT/);
  });
});
