import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { resolveJwtSecret } from '../../shared/auth/jwt-secret';
import { decryptSecret, encryptSecret, generateSecret, otpauthUri, verifyTotp } from '../../shared/auth/totp';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_DAYS = 30;
// Requisições paralelas do navegador podem renovar com o mesmo token; dentro desta janela não é tratado como roubo.
const REUSE_GRACE_MS = 30_000;
export type ClientContext = { ip?: string; userAgent?: string };
const RECOVERY_CODES = 8;
const newRecoveryCode = () => `${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private loadUser(where: { id: string } | { storeId_email: { storeId: string; email: string } }) {
    return this.prisma.user.findUnique({ where, include: { store: { select: { id: true, slug: true, name: true } }, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  }

  /** Emite access token curto e refresh token opaco (guardado só como hash). */
  private async issue(user: NonNullable<Awaited<ReturnType<AuthService['loadUser']>>>, client: ClientContext = {}) {
    const permissions = [...new Set(user.roles.flatMap(x => x.role.permissions.map(p => p.permission.key)))];
    const accessToken = await this.jwt.signAsync({ sub: user.id, storeId: user.storeId, permissions });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000), ip: client.ip?.slice(0, 64), userAgent: client.userAgent?.slice(0, 300), lastUsedAt: new Date() } });
    return { accessToken, expiresIn: ACCESS_TTL_SECONDS, refreshToken, user: { id: user.id, name: user.name, email: user.email, permissions, store: user.store } };
  }

  async login(input: { email: string; password: string; storeSlug: string; code?: string }, client: ClientContext = {}) {
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } });
    const user = store && await this.loadUser({ storeId_email: { storeId: store.id, email: input.email } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) throw new UnauthorizedException('Credenciais inválidas');
    if (user.mfaEnabled) await this.checkSecondFactor(user, input.code);
    return this.issue(user, client);
  }

  /** Rotaciona o refresh token. Reuso de um token já trocado revoga todas as sessões do usuário. */
  async refresh(refreshToken: string, client: ClientContext = {}) {
    const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Sessão inválida');
    const revoked = await this.prisma.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    const withinGrace = stored.revokedAt && Date.now() - stored.revokedAt.getTime() < REUSE_GRACE_MS && stored.expiresAt > new Date();
    if (!revoked.count && !withinGrace) {
      // Só um token trocado por rotação (ainda dentro da validade) indica roubo. Tokens encerrados por logout
      // ou troca de senha já nascem expirados e apenas são recusados. Expira junto para que a janela de
      // tolerância não reabra as sessões revogadas.
      if (stored.revokedAt && stored.expiresAt > new Date()) await this.prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date(), expiresAt: new Date() } });
      throw new UnauthorizedException('Sessão expirada');
    }
    const user = await this.loadUser({ id: stored.userId });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Sessão inválida');
    return this.issue(user, { ip: client.ip ?? stored.ip ?? undefined, userAgent: client.userAgent ?? stored.userAgent ?? undefined });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken) }, data: { revokedAt: new Date(), expiresAt: new Date() } });
  }

  /** Troca a senha, encerra todas as sessões abertas e devolve uma nova sessão para quem trocou. */
  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    const user = await this.loadUser({ id: userId });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Sessão inválida');
    if (!(await argon2.verify(user.passwordHash, input.currentPassword))) throw new BadRequestException('Senha atual incorreta');
    if (input.currentPassword === input.newPassword) throw new BadRequestException('A nova senha precisa ser diferente da atual');
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), expiresAt: new Date() } }),
    ]);
    return this.issue(user);
  }

  private mfaKey = () => resolveJwtSecret();

  /** Segundo fator no login: código do app (uma única vez por janela) ou código de recuperação (uso único). */
  private async checkSecondFactor(user: { id: string; mfaSecretEnc: string | null; mfaRecovery: string[] }, code?: string) {
    if (!code) throw new UnauthorizedException({ message: 'Informe o código de verificação', code: 'MFA_REQUIRED' });
    const clean = code.trim();
    if (user.mfaSecretEnc && /^\d{6}$/.test(clean)) {
      const step = verifyTotp(decryptSecret(user.mfaSecretEnc, this.mfaKey()), clean);
      if (step !== null) {
        // Condicional: o mesmo código não vale duas vezes (replay).
        const used = await this.prisma.user.updateMany({ where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
        if (used.count) return;
      }
    } else {
      const hash = hashToken(clean.toLowerCase());
      if (user.mfaRecovery.includes(hash)) {
        const used = await this.prisma.user.updateMany({ where: { id: user.id, mfaRecovery: { has: hash } }, data: { mfaRecovery: user.mfaRecovery.filter(item => item !== hash) } });
        if (used.count) return;
      }
    }
    throw new UnauthorizedException({ message: 'Código de verificação inválido', code: 'MFA_INVALID' });
  }

  async mfaStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabled: true, mfaRecovery: true } });
    return { enabled: user.mfaEnabled, recoveryCodesLeft: user.mfaRecovery.length };
  }

  /** Gera um segredo pendente; só passa a valer depois de confirmado com um código. */
  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { store: { select: { name: true } } } });
    if (user.mfaEnabled) throw new BadRequestException('A verificação em duas etapas já está ativa');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptSecret(secret, this.mfaKey()) } });
    return { secret, otpauthUrl: otpauthUri(secret, user.email, user.store.name) };
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('A verificação em duas etapas já está ativa');
    if (!user.mfaSecretEnc) throw new BadRequestException('Inicie a configuração primeiro');
    const step = verifyTotp(decryptSecret(user.mfaSecretEnc, this.mfaKey()), code.trim());
    if (step === null) throw new BadRequestException('Código incorreto');
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaLastStep: step, mfaRecovery: codes.map(hashToken) } });
    return { recoveryCodes: codes };
  }

  async mfaDisable(userId: string, input: { password: string; code: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) throw new BadRequestException('A verificação em duas etapas não está ativa');
    if (!(await argon2.verify(user.passwordHash, input.password))) throw new BadRequestException('Senha incorreta');
    try { await this.checkSecondFactor(user, input.code); } catch { throw new BadRequestException('Código incorreto'); }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecovery: [], mfaLastStep: null } });
    return { enabled: false };
  }

  listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' }, select: { id: true, ip: true, userAgent: true, lastUsedAt: true, createdAt: true } });
  }

  async revokeSession(userId: string, id: string) {
    const done = await this.prisma.refreshToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date(), expiresAt: new Date() } });
    if (!done.count) throw new NotFoundException('Sessão não encontrada');
  }

  revokeAllSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), expiresAt: new Date() } }).then(r => ({ revoked: r.count }));
  }
}
