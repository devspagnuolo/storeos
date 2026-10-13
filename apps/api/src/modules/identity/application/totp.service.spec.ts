import { TotpService, base32Decode, base32Encode, hotp, totp } from './totp.service';

describe('TOTP', () => {
  // Vetores de teste da RFC 6238 (segredo ASCII "12345678901234567890", SHA-1).
  const secret = Buffer.from('12345678901234567890');

  it('gera os códigos de 8 dígitos da RFC 6238', () => {
    expect(totp(secret, 59_000, 8)).toBe('94287082');
    expect(totp(secret, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(secret, 1_234_567_890_000, 8)).toBe('89005924');
  });

  it('gera os valores HOTP da RFC 4226', () => {
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 1)).toBe('287082');
    expect(hotp(secret, 9)).toBe('520489');
  });

  it('faz round-trip de base32', () => {
    const encoded = base32Encode(secret);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(secret)).toBe(true);
  });

  it('verifica códigos dentro da janela e rejeita fora dela', () => {
    const service = new TotpService();
    const b32 = base32Encode(secret);
    const now = 1_700_000_000_000;
    const current = totp(secret, now);
    expect(service.verify(b32, current, now)).toBe(true);
    expect(service.verify(b32, totp(secret, now, 6, 30, -1), now)).toBe(true);
    expect(service.verify(b32, totp(secret, now, 6, 30, 5), now)).toBe(false);
    expect(service.verify(b32, 'abcdef', now)).toBe(false);
  });
});
