import { describe, expect, it } from 'vitest';
import { formatBrazilPhone, telHref, whatsappDigits } from './footer';

describe('rodapé', () => {
  it('completa o DDI do WhatsApp', () => {
    expect(whatsappDigits('(11) 99348-2824')).toBe('5511993482824');
    expect(whatsappDigits('5511993482824')).toBe('5511993482824');
    expect(whatsappDigits('')).toBe('');
  });

  it('formata o telefone para leitura', () => {
    expect(formatBrazilPhone('5511993482824')).toBe('(11) 99348-2824');
    expect(formatBrazilPhone('1133334444')).toBe('(11) 3333-4444');
    expect(formatBrazilPhone('+1 555 0100')).toBe('+1 555 0100');
  });

  it('monta o link de ligação', () => {
    expect(telHref('+55 (11) 9 9348-2824')).toBe('tel:+5511993482824');
    expect(telHref('(11) 3333-4444')).toBe('tel:+551133334444');
    expect(telHref('123')).toBeNull();
  });
});
