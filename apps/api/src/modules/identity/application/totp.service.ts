import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP (RFC 4226) com HMAC-SHA1. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** TOTP (RFC 6238), passo de 30s. */
export function totp(secret: Buffer, nowMs: number, digits = 6, stepSeconds = 30, offsetSteps = 0): string {
  return hotp(secret, Math.floor(nowMs / 1000 / stepSeconds) + offsetSteps, digits);
}

@Injectable()
export class TotpService {
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  otpauthUri(issuer: string, account: string, secret: string): string {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  /** Aceita janela de ±1 passo para tolerar deriva de relógio. */
  verify(secretBase32: string, code: string, nowMs = Date.now(), window = 1): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const secret = base32Decode(secretBase32);
    const given = Buffer.from(code);
    for (let step = -window; step <= window; step += 1) {
      const expected = Buffer.from(totp(secret, nowMs, 6, 30, step));
      if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
    }
    return false;
  }

  generateRecoveryCodes(count = 8): string[] {
    return Array.from({ length: count }, () => randomBytes(5).toString('hex'));
  }
}
