import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;

export function base32Encode(buffer: Buffer) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  let bits = 0; let value = 0; const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('base32 inválido');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));

/** Código TOTP (RFC 6238, SHA-1, 6 dígitos) para o passo de 30 s informado. */
export function totpAt(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / PERIOD);

/** Aceita o passo atual e um vizinho (relógios levemente fora de hora). Devolve o passo usado ou null. */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const candidate of [step, step - 1, step + 1]) {
    const expected = Buffer.from(totpAt(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(code))) return candidate;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=${PERIOD}&digits=6`;

const key = (base: string) => createHash('sha256').update(`storeos:mfa:${base}`).digest();

/** Cifra o segredo TOTP em repouso (AES-256-GCM). */
export function encryptSecret(plain: string, base: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(base), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}

export function decryptSecret(stored: string, base: string) {
  const [iv, tag, data] = stored.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(base), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
