import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventEnvelope } from '@storeos/contracts';
import { PrismaService } from '../prisma/prisma.service';

export type EventHandlerFn = (event: DomainEventEnvelope) => Promise<void>;

interface Registration {
  consumer: string;
  handler: EventHandlerFn;
}

/**
 * Barramento interno: consumidores registram (evento, nome-do-consumidor, handler).
 * Cada consumidor é idempotente por evento via tabela ProcessedEvent (inbox).
 */
@Injectable()
export class EventDispatcher {
  private readonly logger = new Logger(EventDispatcher.name);
  private readonly registry = new Map<string, Registration[]>();

  constructor(private readonly prisma: PrismaService) {}

  on(eventName: string, consumer: string, handler: EventHandlerFn): void {
    const list = this.registry.get(eventName) ?? [];
    list.push({ consumer, handler });
    this.registry.set(eventName, list);
  }

  async dispatch(event: DomainEventEnvelope): Promise<void> {
    const registrations = this.registry.get(event.name) ?? [];
    for (const { consumer, handler } of registrations) {
      const already = await this.prisma.processedEvent.findUnique({
        where: { consumer_eventId: { consumer, eventId: event.id } },
      });
      if (already) continue;
      await handler(event);
      await this.prisma.processedEvent
        .create({ data: { consumer, eventId: event.id } })
        .catch((err) => this.logger.debug(`inbox duplicado (${consumer}/${event.id}): ${(err as Error).message}`));
    }
  }
}
