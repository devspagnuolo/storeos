import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenPair } from '@storeos/contracts';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../config/app-config';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { randomToken, sha256 } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { AccessTokenPayload } from '../../../shared/presentation/request.types';

export interface Subject {
  kind: 'user' | 'customer';
  id: string;
  storeId: string;
  permissions: string[];
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  signAccess(subject: Subject): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: subject.id,
      sid: subject.storeId,
      typ: subject.kind,
      perms: subject.kind === 'user' ? subject.permissions : undefined,
    };
    return this.jwt.signAsync(payload, { expiresIn: this.config.env.ACCESS_TOKEN_TTL_SECONDS, issuer: 'storeos', jwtid: randomUUID() });
  }

  /** Token curto de desafio MFA (não concede acesso à API). */
  signMfaChallenge(userId: string, storeId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, sid: storeId, typ: 'mfa' };
    return this.jwt.signAsync(payload, { expiresIn: 300, issuer: 'storeos' });
  }

  async verifyMfaChallenge(token: string): Promise<{ userId: string; storeId: string }> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { issuer: 'storeos' });
      if (payload.typ !== 'mfa') throw new Error('tipo inválido');
      return { userId: payload.sub, storeId: payload.sid };
    } catch {
      throw new UnauthorizedError('Desafio MFA inválido ou expirado', 'INVALID_MFA_CHALLENGE');
    }
  }

  async issuePair(subject: Subject, meta: SessionMeta, familyId: string = randomUUID()): Promise<TokenPair> {
    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt,
        userId: subject.kind === 'user' ? subject.id : null,
        customerId: subject.kind === 'customer' ? subject.id : null,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    return { accessToken: await this.signAccess(subject), refreshToken, expiresIn: this.config.env.ACCESS_TOKEN_TTL_SECONDS };
  }

  /**
   * Rotação de refresh token. Reapresentar um token já rotacionado indica roubo:
   * toda a família é revogada.
   */
  async rotate(
    refreshToken: string,
    meta: SessionMeta,
    loadSubject: (row: { userId: string | null; customerId: string | null }) => Promise<Subject | null>,
  ): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row) throw new UnauthorizedError('Refresh token inválido', 'INVALID_REFRESH_TOKEN');

    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedError('Sessão revogada. Faça login novamente.', 'REFRESH_TOKEN_REUSED');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedError('Sessão expirada', 'REFRESH_TOKEN_EXPIRED');

    const subject = await loadSubject(row);
    if (!subject) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedError('Conta indisponível', 'ACCOUNT_UNAVAILABLE');
    }

    const next = await this.issuePair(subject, meta, row.familyId);
    const nextRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(next.refreshToken) } });
    // Revogação condicional evita que duas requisições concorrentes rotacionem o mesmo token.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: nextRow?.id },
    });
    if (revoked.count === 0) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedError('Sessão revogada. Faça login novamente.', 'REFRESH_TOKEN_REUSED');
    }
    return next;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
