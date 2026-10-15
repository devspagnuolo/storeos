import { hashToken, isValidCnpj, isValidSlug, newVerificationToken, parseProfile, pickSlug, signupProblem, slugify, verificationMail } from './onboarding-rules';

const ok = { ownerName: 'Maria Silva', email: 'maria@vivi.com.br', password: 'Senha-Forte-2026', storeName: 'Vivi Moda Plus Size', acceptTerms: true };

describe('criação de loja', () => {
  it('gera o endereço a partir do nome', () => {
    expect(slugify('  Vivi Moda Plus-Size! ')).toBe('vivi-moda-plus-size');
    expect(slugify('Ação & Coração Ltda.')).toBe('acao-coracao-ltda');
    expect(slugify('x'.repeat(60))).toHaveLength(40);
  });
  it('evita endereços reservados e repetidos', () => {
    expect(isValidSlug('painel')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('-ab-')).toBe(false);
    expect(pickSlug('Vivi Moda', new Set())).toBe('vivi-moda');
    expect(pickSlug('Vivi Moda', new Set(['vivi-moda', 'vivi-moda-2']))).toBe('vivi-moda-3');
    expect(pickSlug('Admin', new Set())).toBe('admin-2');
    expect(pickSlug('!!', new Set())).toBeNull();
  });
  it('confere os dados do cadastro', () => {
    expect(signupProblem(ok)).toBeNull();
    expect(signupProblem({ ...ok, ownerName: 'M' })).toMatch(/nome/);
    expect(signupProblem({ ...ok, email: 'maria@' })).toMatch(/e-mail/);
    expect(signupProblem({ ...ok, storeName: 'ab' })).toMatch(/loja/);
    expect(signupProblem({ ...ok, password: 'curta' })).toMatch(/12/);
    expect(signupProblem({ ...ok, password: 'aaaaaaaaaaaaaa' })).toMatch(/repetitiva/);
    expect(signupProblem({ ...ok, password: 'maria-maria-2026' })).toMatch(/e-mail/);
    expect(signupProblem({ ...ok, acceptTerms: false })).toMatch(/termos/);
  });
  it('gera token só guardado como hash', () => {
    const a = newVerificationToken();
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.token).not.toBe(newVerificationToken().token);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
  });
  it('escapa o nome da loja no e-mail', () => {
    const mail = verificationMail({ ownerName: 'Maria', storeName: '<b>Loja</b>', link: 'https://x.com/a?b=1&c=2' });
    expect(mail.html).toContain('&lt;b&gt;Loja&lt;/b&gt;');
    expect(mail.html).toContain('b=1&amp;c=2');
    expect(mail.text).toContain('https://x.com/a?b=1&c=2');
  });
  it('valida CNPJ e perfil comercial', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(parseProfile({ segment: 'moda', stage: 'online', phone: '(11) 99999-1234', cnpj: '11.222.333/0001-81', city: ' São Paulo ' })).toEqual({ ok: true, profile: { segment: 'moda', stage: 'online', phone: '11999991234', cnpj: '11222333000181', city: 'São Paulo' } });
    expect(parseProfile({ segment: 'xyz' })).toMatchObject({ ok: false });
    expect(parseProfile({ phone: '123' })).toMatchObject({ ok: false });
    expect(parseProfile({ cnpj: '123' })).toMatchObject({ ok: false });
    expect(parseProfile({})).toEqual({ ok: true, profile: {} });
  });
});
