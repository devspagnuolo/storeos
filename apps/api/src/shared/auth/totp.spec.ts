import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateSecret, totpAt, verifyTotp } from './totp';

describe('totp', () => {
  it('bate com o vetor de teste da RFC 6238 (SHA-1)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('base32 faz ida e volta', () => {
    const raw = Buffer.from('segredo-qualquer');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
  });
  it('aceita o passo atual e vizinhos, recusa o resto', () => {
    const secret = generateSecret();
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 5), now)).toBeNull();
    expect(verifyTotp(secret, 'abc123', now)).toBeNull();
  });
  it('cifra e decifra o segredo; chave errada falha', () => {
    const stored = encryptSecret('ABC', 'k1');
    expect(stored).not.toContain('ABC');
    expect(decryptSecret(stored, 'k1')).toBe('ABC');
    expect(() => decryptSecret(stored, 'k2')).toThrow();
  });
});
