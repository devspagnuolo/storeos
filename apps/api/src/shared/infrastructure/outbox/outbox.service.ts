import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';

export interface OutboxEntry {
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  eventName: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  /** Grava o evento na MESMA transação do agregado (Transactional Outbox). */
  async enqueue(tx: Tx, entry: OutboxEntry): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        storeId: entry.storeId,
        aggregateType: entry.aggregateType,
        aggregateId: entry.aggregateId,
        eventName: entry.eventName,
        payload: entry.payload as Prisma.InputJsonValue,
      },
    });
  }
}
