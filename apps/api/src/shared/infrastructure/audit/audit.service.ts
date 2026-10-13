import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { RequestContext } from '../request-context';

export interface AuditEntry {
  storeId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  actorType?: 'USER' | 'CUSTOMER' | 'SYSTEM' | 'INTEGRATION';
  actorId?: string | null;
}

const SENSITIVE_KEYS = /pass(word)?|secret|token|authorization|card|cvv|document|cpf|cnpj|hash/i;

/** Remove/mascara campos sensíveis antes de persistir qualquer snapshot. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra no mesmo cliente transacional quando `tx` é informado. Nunca derruba a operação principal sem tx. */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = RequestContext.get();
    const client = tx ?? this.prisma;
    const data: Prisma.AuditLogUncheckedCreateInput = {
      storeId: entry.storeId ?? ctx?.storeId ?? null,
      actorType: entry.actorType ?? ctx?.actorType ?? 'SYSTEM',
      actorId: entry.actorId ?? ctx?.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (redact(entry.before) as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (redact(entry.after) as Prisma.InputJsonValue),
      metadata: entry.metadata === undefined ? undefined : (redact(entry.metadata) as Prisma.InputJsonValue),
      ip: ctx?.ip,
      userAgent: ctx?.userAgent?.slice(0, 300),
      requestId: ctx?.requestId,
    };
    if (tx) {
      await client.auditLog.create({ data });
      return;
    }
    try {
      await client.auditLog.create({ data });
    } catch (err) {
      this.logger.error(`Falha ao gravar auditoria (${entry.action}): ${(err as Error).message}`);
    }
  }
}
