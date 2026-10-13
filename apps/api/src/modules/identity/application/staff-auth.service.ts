import { Injectable } from '@nestjs/common';
import { EventNames, LoginInput, LoginResult, RegisterStoreInput, SessionUser, TokenPair } from '@storeos/contracts';
import { BusinessRuleError, ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { EncryptionService, randomToken, sha256 } from '../../../shared/infrastructure/crypto/encryption.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PasswordService } from './password.service';
import { StoreBootstrapService } from './store-bootstrap.service';
import { SessionMeta, Subject, TokenService } from './token.service';
import { TotpService } from './totp.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly bootstrapper: StoreBootstrapService,
  ) {}

  async registerStore(input: RegisterStoreInput, meta: SessionMeta): Promise<{ storeId: string; user: SessionUser } & TokenPair> {
    const passwordHash = await this.passwords.hash(input.password);
    const result = await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.store.findUnique({ where: { slug: input.storeSlug } });
      if (existing) throw new ConflictError('Este endereço de loja já está em uso', 'STORE_SLUG_TAKEN');

      const store = await tx.store.create({ data: { name: input.storeName, slug: input.storeSlug, contactEmail: input.email } });
      const { roleIds } = await this.bootstrapper.bootstrap(tx, store.id);
      const user = await tx.user.create({
        data: { storeId: store.id, email: input.email, name: input.ownerName, passwordHash, roles: { create: { roleId: roleIds.OWNER } } },
      });
      await this.outbox.enqueue(tx, {
        storeId: store.id,
        aggregateType: 'Store',
        aggregateId: store.id,
        eventName: EventNames.STORE_CREATED,
        payload: { storeId: store.id, slug: store.slug },
      });
      await this.audit.record({ storeId: store.id, action: 'store.created', entityType: 'Store', entityId: store.id, actorType: 'USER', actorId: user.id }, tx);
      return { store, user };
    });

    const session = await this.sessionUser(result.user.id);
    const pair = await this.tokens.issuePair(this.toSubject(session), meta);
    return { storeId: result.store.id, user: session, ...pair };
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } });
    const user = store
      ? await this.prisma.user.findUnique({ where: { storeId_email: { storeId: store.id, email: input.email } } })
      : null;

    if (!store || !user) {
      await this.passwords.burn(input.password);
      throw new UnauthorizedError('Credenciais inválidas', 'INVALID_CREDENTIALS');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('Conta temporariamente bloqueada por tentativas excessivas. Tente mais tarde.', 'ACCOUNT_LOCKED');
    }
    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid || user.status !== 'ACTIVE' || store.status !== 'ACTIVE') {
      if (!valid) await this.registerFailure(user.id, store.id, user.failedLoginCount + 1);
      throw new UnauthorizedError('Credenciais inválidas', 'INVALID_CREDENTIALS');
    }

    if (user.mfaEnabled) {
      return { mfaRequired: true, challengeToken: await this.tokens.signMfaChallenge(user.id, store.id) };
    }
    return this.complete(user.id, meta);
  }

  async verifyMfa(challengeToken: string, code: string, meta: SessionMeta): Promise<LoginResult> {
    const { userId, storeId } = await this.tokens.verifyMfaChallenge(challengeToken);
    const user = await this.prisma.user.findFirst({ where: { id: userId, storeId, status: 'ACTIVE' } });
    if (!user || !user.mfaSecretEnc) throw new UnauthorizedError('MFA indisponível', 'INVALID_MFA');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedError('Conta temporariamente bloqueada', 'ACCOUNT_LOCKED');

    const ok = await this.checkSecondFactor(user, code);
    if (!ok) {
      await this.registerFailure(user.id, storeId, user.failedLoginCount + 1);
      throw new UnauthorizedError('Código inválido', 'INVALID_MFA');
    }
    return this.complete(user.id, meta);
  }

  async refresh(refreshToken: string, meta: SessionMeta): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, meta, async (row) => {
      if (!row.userId) return null;
      const user = await this.prisma.user.findFirst({ where: { id: row.userId, status: 'ACTIVE', store: { status: 'ACTIVE' } } });
      return user ? this.toSubject(await this.sessionUser(user.id)) : null;
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<SessionUser> {
    return this.sessionUser(userId);
  }

  // ── MFA enrolment ──

  async beginMfaSetup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.mustFind(userId);
    if (user.mfaEnabled) throw new BusinessRuleError('MFA já está ativo', 'MFA_ALREADY_ENABLED');
    const secret = this.totp.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.crypto.encrypt(secret) } });
    return { secret, otpauthUri: this.totp.otpauthUri('STOREOS', user.email, secret) };
  }

  async confirmMfaSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.mustFind(userId);
    if (!user.mfaSecretEnc) throw new BusinessRuleError('Inicie a configuração do MFA primeiro', 'MFA_NOT_STARTED');
    if (!this.totp.verify(this.crypto.decrypt(user.mfaSecretEnc), code)) throw new UnauthorizedError('Código inválido', 'INVALID_MFA');
    const recoveryCodes = this.totp.generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaRecoveryHashes: recoveryCodes.map((c) => sha256(c)) },
    });
    await this.audit.record({ storeId: user.storeId, action: 'auth.mfa-enabled', entityType: 'User', entityId: userId });
    return { recoveryCodes };
  }

  async disableMfa(userId: string, password: string, code: string): Promise<void> {
    const user = await this.mustFind(userId);
    if (!(await this.passwords.verify(user.passwordHash, password))) throw new UnauthorizedError('Senha incorreta', 'INVALID_CREDENTIALS');
    if (!(await this.checkSecondFactor(user, code))) throw new UnauthorizedError('Código inválido', 'INVALID_MFA');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: [] } });
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({ storeId: user.storeId, action: 'auth.mfa-disabled', entityType: 'User', entityId: userId });
  }

  // ── Convites ──

  async inviteUser(storeId: string, input: { email: string; name: string; roleName: string }, invitedBy: string): Promise<{ inviteToken: string }> {
    const role = await this.prisma.role.findFirst({ where: { storeId, name: input.roleName } });
    if (!role) throw new NotFoundError('Papel não encontrado', 'ROLE_NOT_FOUND');
    if (role.name === 'OWNER') throw new BusinessRuleError('Não é possível convidar outro proprietário', 'CANNOT_INVITE_OWNER');
    const existing = await this.prisma.user.findUnique({ where: { storeId_email: { storeId, email: input.email } } });
    if (existing) throw new ConflictError('Já existe um usuário com este e-mail', 'USER_EXISTS');

    const token = randomToken(32);
    const user = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.user.create({
        data: { storeId, email: input.email, name: input.name, passwordHash: '!', status: 'INVITED', roles: { create: { roleId: role.id } } },
      });
      await tx.oneTimeToken.create({
        data: {
          storeId,
          purpose: 'USER_INVITE',
          subjectType: 'USER',
          subjectId: created.id,
          email: input.email,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
      await this.outbox.enqueue(tx, {
        storeId,
        aggregateType: 'User',
        aggregateId: created.id,
        eventName: EventNames.USER_INVITED,
        payload: { userId: created.id, email: input.email, role: role.name },
      });
      return created;
    });
    await this.audit.record({ storeId, action: 'users.invited', entityType: 'User', entityId: user.id, actorId: invitedBy, actorType: 'USER' });
    return { inviteToken: token };
  }

  async acceptInvite(token: string, password: string, meta: SessionMeta): Promise<LoginResult> {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.purpose !== 'USER_INVITE' || row.usedAt || row.expiresAt < new Date() || !row.subjectId) {
      throw new UnauthorizedError('Convite inválido ou expirado', 'INVALID_INVITE');
    }
    const passwordHash = await this.passwords.hash(password);
    const claimed = await this.prisma.oneTimeToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw new UnauthorizedError('Convite inválido ou expirado', 'INVALID_INVITE');
    await this.prisma.user.update({ where: { id: row.subjectId }, data: { passwordHash, status: 'ACTIVE' } });
    return this.complete(row.subjectId, meta);
  }

  // ── internos ──

  private async complete(userId: string, meta: SessionMeta): Promise<LoginResult> {
    await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await this.sessionUser(userId);
    const pair = await this.tokens.issuePair(this.toSubject(session), meta);
    await this.audit.record({ storeId: session.storeId, action: 'auth.login', entityType: 'User', entityId: userId, actorType: 'USER', actorId: userId });
    return { mfaRequired: false, ...pair, user: session };
  }

  private async registerFailure(userId: string, storeId: string, failures: number): Promise<void> {
    const lock = failures >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
    });
    if (lock) await this.audit.record({ storeId, action: 'auth.account-locked', entityType: 'User', entityId: userId, actorType: 'SYSTEM' });
  }

  private async checkSecondFactor(user: { id: string; mfaSecretEnc: string | null; mfaRecoveryHashes: string[] }, code: string): Promise<boolean> {
    if (user.mfaSecretEnc && this.totp.verify(this.crypto.decrypt(user.mfaSecretEnc), code)) return true;
    const hash = sha256(code.trim().toLowerCase());
    if (!user.mfaRecoveryHashes.includes(hash)) return false;
    // Código de recuperação é de uso único.
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((h) => h !== hash) } });
    return true;
  }

  private async mustFind(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Usuário não encontrado');
    return user;
  }

  async sessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    const permissions = [...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)))].sort();
    return { id: user.id, storeId: user.storeId, name: user.name, email: user.email, permissions, mfaEnabled: user.mfaEnabled };
  }

  private toSubject(session: SessionUser): Subject {
    return { kind: 'user', id: session.id, storeId: session.storeId, permissions: session.permissions };
  }
}
