import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../../config/app-config';

/**
 * Criptografia de campos sensíveis (AES-256-GCM). Formato: v1:<iv>:<tag>:<ciphertext> (base64).
 * O prefixo de versão permite rotação de chaves sem migração em massa.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(config: AppConfig) {
    const key = Buffer.from(config.env.ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY deve decodificar para exatamente 32 bytes');
    }
    this.key = key;
    this.hmacKey = createHash('sha256').update(Buffer.concat([key, Buffer.from('storeos:hmac')])).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(token: string): string {
    const [version, iv, tag, data] = token.split(':');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de dado criptografado inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(token: string): T {
    return JSON.parse(this.decrypt(token)) as T;
  }

  /** Hash determinístico para busca por igualdade (ex.: CPF) sem expor o valor. */
  searchHash(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Verifica assinatura HMAC-SHA256 em hex (aceita prefixo "sha256="). */
export function verifyHmacSha256(secret: string, payload: Buffer | string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signature.replace(/^sha256=/i, '').trim().toLowerCase();
  return safeEqual(expected, provided);
}
