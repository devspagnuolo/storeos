import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_DAYS = 30;
// Requisições paralelas do navegador podem renovar com o mesmo token; dentro desta janela não é tratado como roubo.
const REUSE_GRACE_MS = 30_000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private loadUser(where: { id: string } | { storeId_email: { storeId: string; email: string } }) {
    return this.prisma.user.findUnique({ where, include: { store: { select: { id: true, slug: true, name: true } }, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  }

  /** Emite access token curto e refresh token opaco (guardado só como hash). */
  private async issue(user: NonNullable<Awaited<ReturnType<AuthService['loadUser']>>>) {
    const permissions = [...new Set(user.roles.flatMap(x => x.role.permissions.map(p => p.permission.key)))];
    const accessToken = await this.jwt.signAsync({ sub: user.id, storeId: user.storeId, permissions });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000) } });
    return { accessToken, expiresIn: ACCESS_TTL_SECONDS, refreshToken, user: { id: user.id, name: user.name, email: user.email, permissions, store: user.store } };
  }

  async login(input: { email: string; password: string; storeSlug: string }) {
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } });
    const user = store && await this.loadUser({ storeId_email: { storeId: store.id, email: input.email } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) throw new UnauthorizedException('Credenciais inválidas');
    return this.issue(user);
  }

  /** Rotaciona o refresh token. Reuso de um token já trocado revoga todas as sessões do usuário. */
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Sessão inválida');
    const revoked = await this.prisma.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    const withinGrace = stored.revokedAt && Date.now() - stored.revokedAt.getTime() < REUSE_GRACE_MS && stored.expiresAt > new Date();
    if (!revoked.count && !withinGrace) {
      // Expira junto para que a janela de tolerância não reabra as sessões revogadas.
      if (stored.revokedAt) await this.prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date(), expiresAt: new Date() } });
      throw new UnauthorizedException('Sessão expirada');
    }
    const user = await this.loadUser({ id: stored.userId });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Sessão inválida');
    return this.issue(user);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken) }, data: { revokedAt: new Date(), expiresAt: new Date() } });
  }
}
