import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type AuditEntry = {
  storeId?: string | null;
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

/** Campos que nunca entram na trilha, em qualquer nível do corpo da requisição. */
const SECRET_KEYS = /pass(word)?|senha|token|secret|authorization|cvv|card|^code$|recover/i;
const MAX_METADATA_BYTES = 8_000;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (depth > 4) return '[profundo demais]';
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redact(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[oculto]' : redact(item, depth + 1)]));
}

export function boundedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const safe = redact(metadata) as Record<string, unknown>;
  return JSON.stringify(safe).length > MAX_METADATA_BYTES ? { truncado: true } : safe;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grava um evento. Falha de auditoria nunca derruba a operação do usuário, mas é registrada no log do servidor. */
  async record(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({ data: { ...entry, metadata: boundedMetadata(entry.metadata) as Prisma.InputJsonValue | undefined } });
    } catch (error) {
      this.logger.error(`Falha ao gravar auditoria (${entry.action}): ${(error as Error).message}`);
    }
  }

  async findStoreId(slug: string) {
    return (await this.prisma.store.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
  }

  async list(storeId: string, query: { page?: number; pageSize?: number; entity?: string; actorId?: string; outcome?: string; action?: string; from?: Date; to?: Date }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.AuditLogWhereInput = {
      storeId,
      ...(query.entity && { entity: query.entity }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.outcome && { outcome: query.outcome }),
      ...(query.action && { action: { contains: query.action, mode: 'insensitive' } }),
      ...((query.from || query.to) && { createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map(item => item.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds }, storeId }, select: { id: true, name: true, email: true } }) : [];
    const byId = new Map(actors.map(actor => [actor.id, actor]));
    return { items: items.map(item => ({ ...item, actor: item.actorId ? byId.get(item.actorId) ?? null : null })), total, page, pageSize };
  }
}
