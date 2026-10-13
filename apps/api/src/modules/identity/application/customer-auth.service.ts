import { Injectable } from '@nestjs/common';
import { EventNames, TokenPair } from '@storeos/contracts';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionMeta, Subject, TokenService } from './token.service';

export interface CustomerRegistration {
  storeId: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  acceptsMarketing: boolean;
  meta: SessionMeta;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
  ) {}

  async register(input: CustomerRegistration): Promise<TokenPair & { customerId: string }> {
    const passwordHash = await this.passwords.hash(input.password);
    const customer = await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { storeId_email: { storeId: input.storeId, email: input.email } } });
      // Cliente "guest" (criado no checkout, sem senha) pode reivindicar a conta.
      if (existing && existing.passwordHash) throw new ConflictError('Este e-mail já está cadastrado', 'EMAIL_TAKEN');

      const data = {
        name: input.name,
        phone: input.phone,
        passwordHash,
        acceptsMarketing: input.acceptsMarketing,
        status: 'ACTIVE' as const,
      };
      const record = existing
        ? await tx.customer.update({ where: { id: existing.id }, data })
        : await tx.customer.create({ data: { ...data, storeId: input.storeId, email: input.email } });

      const consents = [
        { purpose: 'TERMS' as const, granted: true },
        { purpose: 'PRIVACY' as const, granted: true },
        { purpose: 'MARKETING_EMAIL' as const, granted: input.acceptsMarketing },
      ];
      await tx.consent.createMany({
        data: consents.map((c) => ({
          storeId: input.storeId,
          customerId: record.id,
          purpose: c.purpose,
          granted: c.granted,
          version: '2026-01',
          ip: input.meta.ip,
          userAgent: input.meta.userAgent?.slice(0, 300),
        })),
      });
      await this.outbox.enqueue(tx, {
        storeId: input.storeId,
        aggregateType: 'Customer',
        aggregateId: record.id,
        eventName: EventNames.CUSTOMER_REGISTERED,
        payload: { customerId: record.id, email: record.email },
      });
      return record;
    });
    const pair = await this.tokens.issuePair(this.subject(customer.id, input.storeId), input.meta);
    return { customerId: customer.id, ...pair };
  }

  async login(storeId: string, email: string, password: string, meta: SessionMeta): Promise<TokenPair> {
    const customer = await this.prisma.customer.findUnique({ where: { storeId_email: { storeId, email } } });
    if (!customer || !customer.passwordHash || customer.status !== 'ACTIVE') {
      await this.passwords.burn(password);
      throw new UnauthorizedError('Credenciais inválidas', 'INVALID_CREDENTIALS');
    }
    if (!(await this.passwords.verify(customer.passwordHash, password))) {
      throw new UnauthorizedError('Credenciais inválidas', 'INVALID_CREDENTIALS');
    }
    return this.tokens.issuePair(this.subject(customer.id, storeId), meta);
  }

  refresh(refreshToken: string, meta: SessionMeta): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, meta, async (row) => {
      if (!row.customerId) return null;
      const customer = await this.prisma.customer.findFirst({ where: { id: row.customerId, status: 'ACTIVE' } });
      return customer ? this.subject(customer.id, customer.storeId) : null;
    });
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  async me(customerId: string, storeId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, storeId } });
    if (!c) throw new NotFoundError('Cliente não encontrado');
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      acceptsMarketing: c.acceptsMarketing,
      ordersCount: c.ordersCount,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private subject(id: string, storeId: string): Subject {
    return { kind: 'customer', id, storeId, permissions: [] };
  }
}
