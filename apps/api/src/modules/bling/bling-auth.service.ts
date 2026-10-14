import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveJwtSecret } from '../../shared/auth/jwt-secret';
import { decryptSecret, encryptSecret } from '../../shared/auth/totp';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingApiError, BlingClient, BlingTokens } from './bling.client';

const key = () => process.env.INTEGRATIONS_KEY ?? resolveJwtSecret();
const sign = (payload: string) => createHmac('sha256', key()).update(`bling-state:${payload}`).digest('base64url');

/** O `state` do OAuth leva a loja e um prazo, assinados: o callback é público e não pode ser forjado. */
export const makeState = (storeId: string, now = Date.now()) => { const payload = Buffer.from(JSON.stringify({ s: storeId, e: now + 10 * 60_000 })).toString('base64url'); return `${payload}.${sign(payload)}`; };
export function readState(state: string, now = Date.now()): string | undefined {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return undefined;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { s: string; e: number };
    return e > now ? s : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class BlingAuthService {
  private refreshing = new Map<string, Promise<string>>();

  constructor(private readonly prisma: PrismaService, private readonly client: BlingClient) {}

  connectUrl(storeId: string) {
    if (!this.client.appConfigured) throw new ServiceUnavailableException('Configure BLING_CLIENT_ID e BLING_CLIENT_SECRET na API antes de conectar.');
    return this.client.authorizeUrl(makeState(storeId));
  }

  async finishConnect(code: string, state: string) {
    const storeId = readState(state);
    if (!storeId) throw new BadRequestException('Autorização expirada ou inválida. Comece a conexão de novo pelo painel.');
    const tokens = await this.client.token({ grant_type: 'authorization_code', code });
    await this.save(storeId, tokens);
    return storeId;
  }

  private async save(storeId: string, tokens: BlingTokens) {
    const data = { accessTokenEnc: encryptSecret(tokens.access_token, key()), refreshTokenEnc: encryptSecret(tokens.refresh_token, key()), expiresAt: new Date(Date.now() + tokens.expires_in * 1000), lastError: null };
    await this.prisma.blingConnection.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
  }

  async disconnect(storeId: string) {
    await this.prisma.blingConnection.deleteMany({ where: { storeId } });
  }

  /** Token de acesso válido; renova (uma vez por vez) quando falta menos de 5 minutos para vencer. */
  async accessToken(storeId: string): Promise<string> {
    const connection = await this.prisma.blingConnection.findUnique({ where: { storeId } });
    if (!connection) throw new ServiceUnavailableException('Bling não conectado');
    if (connection.expiresAt.getTime() - Date.now() > 5 * 60_000) return decryptSecret(connection.accessTokenEnc, key());
    const pending = this.refreshing.get(storeId) ?? this.refresh(storeId, decryptSecret(connection.refreshTokenEnc, key())).finally(() => this.refreshing.delete(storeId));
    this.refreshing.set(storeId, pending);
    return pending;
  }

  private async refresh(storeId: string, refreshToken: string) {
    try {
      const tokens = await this.client.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
      await this.save(storeId, tokens);
      return tokens.access_token;
    } catch (error) {
      // Refresh token vencido ou revogado: só reconectando.
      if (error instanceof BlingApiError && (error.status === 400 || error.status === 401)) await this.prisma.blingConnection.update({ where: { storeId }, data: { lastError: 'A autorização do Bling expirou. Conecte de novo.' } });
      throw error;
    }
  }
}
