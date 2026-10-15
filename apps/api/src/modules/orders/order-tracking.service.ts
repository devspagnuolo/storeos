import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { statusLabel, trackingLink } from './tracking-rules';

/** Consulta pública de pedido: exige número e e-mail do comprador e devolve só dados de acompanhamento. */
@Injectable()
export class OrderTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async track(storeSlug: string, number: string, email: string) {
    const notFound = new NotFoundException('Pedido não encontrado. Confira o número e o e-mail usado na compra.');
    if (!storeSlug || !number?.trim() || !email?.trim()) throw notFound;
    const order = await this.prisma.order.findFirst({
      where: { store: { slug: storeSlug }, number: number.trim(), customer: { is: { email: { equals: email.trim(), mode: 'insensitive' } } } },
      include: { items: { select: { name: true, quantity: true } }, timeline: { orderBy: { createdAt: 'asc' }, select: { status: true, createdAt: true } }, fulfillment: true },
    });
    if (!order) throw notFound;
    const f = order.fulfillment;
    return {
      number: order.number,
      status: order.status,
      statusLabel: statusLabel(order.status),
      createdAt: order.createdAt,
      items: order.items,
      timeline: order.timeline.map(entry => ({ status: entry.status, label: statusLabel(entry.status), at: entry.createdAt })),
      tracking: f?.trackingCode ? { carrier: f.carrier, code: f.trackingCode, url: trackingLink(f.trackingCode, f.trackingUrl), shippedAt: f.shippedAt, deliveredAt: f.deliveredAt } : null,
    };
  }
}
