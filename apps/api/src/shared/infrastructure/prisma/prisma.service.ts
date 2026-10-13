import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Transação interativa com timeout generoso e isolamento padrão (READ COMMITTED). */
  runInTransaction<T>(fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }): Promise<T> {
    return this.$transaction(fn, { maxWait: 5_000, timeout: options?.timeoutMs ?? 15_000 });
  }
}
