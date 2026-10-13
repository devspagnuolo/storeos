import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { InventoryService } from './inventory.service';

/** Libera reservas vencidas de pedidos que nunca foram pagos. */
@Injectable()
export class ReservationExpiryJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReservationExpiryJob.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<number> {
    try {
      const expired = await this.prisma.stockReservation.findMany({
        where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
        select: { storeId: true, referenceType: true, referenceId: true },
        distinct: ['storeId', 'referenceType', 'referenceId'],
        take: 100,
      });
      for (const ref of expired) {
        await this.prisma.runInTransaction((tx) =>
          this.inventory.release(tx, ref.storeId, { type: ref.referenceType, id: ref.referenceId }, 'EXPIRED'),
        );
        if (ref.referenceType === 'ORDER') {
          await this.prisma.order.updateMany({
            where: { id: ref.referenceId, storeId: ref.storeId, status: { in: ['NEW', 'AWAITING_PAYMENT'] } },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Pagamento não confirmado no prazo' },
          });
          await this.prisma.orderTimeline.create({
            data: { orderId: ref.referenceId, type: 'STATUS_CHANGE', status: 'CANCELLED', message: 'Pedido cancelado: pagamento não confirmado no prazo', actorType: 'SYSTEM', visibleToCustomer: true },
          });
        }
      }
      return expired.length;
    } catch (err) {
      this.logger.error(`Falha ao expirar reservas: ${(err as Error).message}`);
      return 0;
    }
  }
}
