import { describe, expect, it } from 'vitest';
import { draftFromAccount, formatPhone, mergeAddress } from './checkout-draft';

describe('rascunho do checkout', () => {
  it('a busca do CEP só preenche o que está vazio', () => {
    expect(mergeAddress({ street: 'Rua que digitei', number: '10' }, { street: 'Av. Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'SP' }))
      .toEqual({ street: 'Rua que digitei', number: '10', district: 'Bela Vista', city: 'São Paulo', state: 'SP' });
  });
  it('formata celular e fixo', () => {
    expect(formatPhone('11988887777')).toBe('(11) 98888-7777');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
    expect(formatPhone('11')).toBe('11');
  });
  it('cliente logado: usa a conta e mantém o que já foi digitado neste aparelho', () => {
    const account = { name: 'Ana Souza', email: 'ana@exemplo.com', phone: '11988887777', address: { zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' } };
    expect(draftFromAccount(account)).toEqual({ name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(11) 98888-7777', zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' });
    expect(draftFromAccount(account, { number: '22', email: 'outro@exemplo.com', complement: ' ' })).toMatchObject({ number: '22', email: 'ana@exemplo.com', street: 'Av. Paulista' });
    expect(draftFromAccount({ ...account, phone: null, address: null })).toEqual({ name: 'Ana Souza', email: 'ana@exemplo.com' });
  });
});
