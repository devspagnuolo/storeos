import { hashLoginCode, loginCodeMail, maskDocument, newLoginCode, newSessionToken } from './account-rules';

describe('regras da área do cliente', () => {
  it('código tem 6 dígitos e só vale para o mesmo e-mail', () => {
    const { code, hash } = newLoginCode('Maria@Example.com ');
    expect(code).toMatch(/^\d{6}$/);
    expect(hashLoginCode('maria@example.com', code)).toBe(hash);
    expect(hashLoginCode('outra@example.com', code)).not.toBe(hash);
  });

  it('token de sessão é longo e só o hash é guardado', () => {
    const session = newSessionToken();
    expect(session.token.length).toBeGreaterThanOrEqual(40);
    expect(session.hash).not.toContain(session.token);
  });

  it('mascara CPF e CNPJ', () => {
    expect(maskDocument('529.982.247-25')).toBe('***.***.247-25');
    expect(maskDocument('11222333000181')).toBe('**.***.***/0001-81');
    expect(maskDocument(null)).toBeNull();
  });

  it('e-mail do código escapa o nome', () => {
    expect(loginCodeMail({ name: '<b>Ana</b>', storeName: 'Vivi', code: '123456' }).html).not.toContain('<b>Ana');
  });
});
