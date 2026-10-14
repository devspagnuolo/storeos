import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { BlingSyncStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';

export type BlingWebhookPayload = {
  eventId?: string;
  event?: string;
  companyId?: string | number;
  data?: {
    id?: string | number;
    numero?: string | number;
    numeroLoja?: string;
    situacao?: { id?: string | number; valor?: string | number };
  };
};

/** Recebe notificações do Bling com assinatura oficial HMAC e correlação por empresa + numeroLoja. */
@Injectable()
export class BlingWebhookService {
  private readonly logger = new Logger(BlingWebhookService.name);

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  async receive(payload: BlingWebhookPayload, rawBody: Buffer | undefined, signature?: string) {
    const secret = process.env.BLING_CLIENT_SECRET;
    if (!secret || !rawBody) throw new ServiceUnavailableException('Webhook Bling não está configurado corretamente');
    if (!signature?.startsWith('sha256=')) throw new UnauthorizedException('Assinatura do Bling ausente ou inválida');

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Assinatura do Bling inválida');
    }

    if (payload.event !== 'order.created' && payload.event !== 'order.updated') return { received: true, ignored: true };
    if (payload.companyId === undefined || payload.companyId === null) return { received: true, ignored: true };

    const connections = await this.prisma.blingConnection.findMany({
      where: { companyId: String(payload.companyId) },
      select: { storeId: true },
    });
    if (!connections.length) {
      this.logger.warn('Webhook recebido para empresa Bling sem conexão STOREOS associada');
      return { received: true, ignored: true };
    }

    const storeIds = connections.map(connection => connection.storeId);
    const orderNumber = payload.data?.numeroLoja?.trim();
    const remoteId = payload.data?.id === undefined || payload.data.id === null ? null : String(payload.data.id);
    const remoteNumber = payload.data?.numero === undefined || payload.data.numero === null ? null : String(payload.data.numero);
    const situationId = payload.data?.situacao?.id === undefined || payload.data.situacao.id === null ? null : String(payload.data.situacao.id);
    const existingSync = remoteId
      ? await this.prisma.blingOrderSync.findFirst({ where: { storeId: { in: storeIds }, blingOrderId: remoteId }, select: { orderId: true } })
      : null;
    const order = existingSync
      ? await this.prisma.order.findUnique({ where: { id: existingSync.orderId }, select: { id: true, storeId: true } })
      : orderNumber
        ? await this.prisma.order.findFirst({ where: { storeId: { in: storeIds }, number: orderNumber }, select: { id: true, storeId: true } })
        : null;
    // Eventos de pedidos que não foram originados no STOREOS não criam vendas locais.
    if (!order) return { received: true, ignored: true };

    const currentSync = await this.prisma.blingOrderSync.findUnique({
      where: { orderId: order.id },
      select: { blingSituationId: true, blingSituationName: true },
    });
    let situationName: string | null = currentSync?.blingSituationId === situationId ? currentSync.blingSituationName : null;
    if (situationId && !situationName) {
      try {
        const token = await this.auth.accessToken(order.storeId);
        const result = await this.client.request<{ data?: { nome?: string; descricao?: string } }>(token, '/situacoes/' + encodeURIComponent(situationId));
        situationName = result.data?.nome ?? result.data?.descricao ?? null;
      } catch (error) {
        // A atualização principal do pedido ainda é persistida; a tela também mostra o ID quando o nome não pode ser consultado.
        this.logger.warn('Não foi possível resolver a situação ' + situationId + ' do Bling: ' + (error as Error).message);
      }
    }

    await this.prisma.blingOrderSync.upsert({
      where: { orderId: order.id },
      create: {
        storeId: order.storeId,
        orderId: order.id,
        status: BlingSyncStatus.SENT,
        blingOrderId: remoteId,
        blingOrderNumber: remoteNumber,
        blingSituationId: situationId,
        blingSituationName: situationName,
        sentAt: new Date(),
        lastError: null,
      },
      update: {
        status: BlingSyncStatus.SENT,
        ...(remoteId && { blingOrderId: remoteId }),
        ...(remoteNumber && { blingOrderNumber: remoteNumber }),
        blingSituationId: situationId,
        blingSituationName: situationName,
        sentAt: new Date(),
        lastError: null,
      },
    });
    return { received: true, ignored: false };
  }
}
