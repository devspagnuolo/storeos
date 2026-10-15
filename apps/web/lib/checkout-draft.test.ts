import { describe, expect, it } from 'vitest';
import { formatPhone, mergeAddress } from './checkout-draft';

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
});
