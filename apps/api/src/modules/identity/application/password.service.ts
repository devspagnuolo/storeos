import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id com parâmetros recomendados pela OWASP (19 MiB, t=2, p=1). */
@Injectable()
export class PasswordService {
  private readonly options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
  private dummyHash: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Gasta o mesmo tempo de uma verificação real quando o usuário não existe (evita enumeração por timing). */
  async burn(plain: string): Promise<void> {
    this.dummyHash ??= argon2.hash('storeos-timing-equalizer', this.options);
    await this.verify(await this.dummyHash, plain);
  }
}
