import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { extractBlingTracking } from '../orders/tracking-rules';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';

/**
 * Pedidos faturados cujo pedido de venda no Bling já tem código de rastreio viram "enviado" no site
 * (o cliente recebe o e-mail de envio). A transição é condicional ao status, então repetir a consulta é seguro.
 */
@Injectable()
export class BlingTrackingService {
  private readonly logger = new Logger(BlingTrackingService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient, private readonly lifecycle: OrderLifecycleService) {}

  @Interval(300_000)
  async tick() {
    if (this.running || process.env.BLING_WORKER === 'off') return;
    this.running = true;
    try { await this.syncAll(); } catch (error) { this.logger.error('Falha ao consultar rastreios do Bling', error as Error); } finally { this.running = false; }
  }

  async syncAll(limit = 20, storeId?: string) {
    const orders = await this.prisma.order.findMany({
      where: { ...(storeId && { storeId }), status: OrderStatus.INVOICED, blingSync: { is: { status: 'SENT', blingOrderId: { not: null } } }, store: { blingConnection: { isNot: null } } },
      select: { id: true, storeId: true, number: true, blingSync: { select: { blingOrderId: true } } },
      orderBy: { updatedAt: 'asc' }, take: limit,
    });
    let shipped = 0;
    for (const order of orders) {
      try {
        const token = await this.auth.accessToken(order.storeId);
        const remote = await this.client.request<unknown>(token, `/pedidos/vendas/${encodeURIComponent(order.blingSync!.blingOrderId!)}`);
        const tracking = extractBlingTracking(remote);
        if (!tracking) { await this.prisma.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } }); continue; } // vai para o fim da fila
        if (await this.lifecycle.markShipped({ orderId: order.id }, { carrier: tracking.carrier ?? 'Transportadora', trackingCode: tracking.code })) shipped++;
      } catch (error) {
        this.logger.warn(`Rastreio do pedido ${order.number} não consultado: ${(error as Error).message}`);
      }
    }
    return { checked: orders.length, shipped };
  }
}
