import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

export interface FraudAssessment {
  score: number;
  decision: 'APPROVE' | 'REVIEW' | 'DENY';
  reasons: string[];
}

const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com', 'yopmail.com'];

/** Antifraude baseado em regras (velocidade, valor, histórico). Complementa — não substitui — o antifraude do adquirente. */
@Injectable()
export class AntifraudService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(input: { storeId: string; email: string; ip?: string; amountCents: number; method: string; customerId?: string | null; shippingState?: string; billingState?: string }): Promise<FraudAssessment> {
    const reasons: string[] = [];
    let score = 0;
    const hourAgo = new Date(Date.now() - 3_600_000);
    const dayAgo = new Date(Date.now() - 86_400_000);

    const recentOrders = await this.prisma.order.count({ where: { storeId: input.storeId, customerEmail: input.email, createdAt: { gte: hourAgo } } });
    if (recentOrders >= 3) {
      score += 30;
      reasons.push('Muitos pedidos na última hora');
    }
    const failedPayments = await this.prisma.payment.count({
      where: { storeId: input.storeId, status: 'FAILED', createdAt: { gte: dayAgo }, order: { customerEmail: input.email } },
    });
    if (failedPayments >= 3) {
      score += 40;
      reasons.push('Várias recusas de pagamento nas últimas 24h');
    } else if (failedPayments >= 1) {
      score += 10;
      reasons.push('Recusa recente');
    }
    if (input.amountCents >= 500_000) {
      score += 20;
      reasons.push('Valor elevado');
    }
    if (!input.customerId) {
      const known = await this.prisma.customer.count({ where: { storeId: input.storeId, email: input.email, ordersCount: { gt: 0 } } });
      if (!known && input.amountCents >= 200_000) {
        score += 15;
        reasons.push('Cliente novo com valor alto');
      }
    }
    if (DISPOSABLE.some((d) => input.email.endsWith(`@${d}`))) {
      score += 25;
      reasons.push('E-mail descartável');
    }
    if (input.shippingState && input.billingState && input.shippingState !== input.billingState) {
      score += 5;
      reasons.push('Entrega e cobrança em estados diferentes');
    }
    if (input.method !== 'CREDIT_CARD') score = Math.floor(score / 3); // PIX/boleto têm risco de chargeback muito menor

    return { score, decision: score >= 70 ? 'DENY' : score >= 40 ? 'REVIEW' : 'APPROVE', reasons };
  }
}
