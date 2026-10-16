import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { MercadoPagoClient } from './mercado-pago.client';
import { currentInstallmentLimits, InstallmentLimits, simulateInstallments, SimulationRow, storeInstallmentLimits, StoredPaymentRules } from './payment-rules';

const BRANDS = [{ id: 'master', name: 'Mastercard' }, { id: 'visa', name: 'Visa' }, { id: 'elo', name: 'Elo' }];

/** Regras de parcelamento de cada loja, editáveis no painel e aplicadas no checkout pelo servidor. */
@Injectable()
export class PaymentRulesService {
  constructor(private readonly prisma: PrismaService, private readonly mercadoPago: MercadoPagoClient) {}

  async limitsBySlug(slug?: string): Promise<InstallmentLimits> {
    if (!slug) return currentInstallmentLimits();
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { paymentRules: true } });
    return storeInstallmentLimits(store?.paymentRules);
  }

  async get(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { paymentRules: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return { limits: storeInstallmentLimits(store.paymentRules), platformMax: currentInstallmentLimits().max, saved: Boolean(store.paymentRules) };
  }

  async update(storeId: string, input: Required<StoredPaymentRules>) {
    const platformMax = currentInstallmentLimits().max;
    const maxInstallments = Math.min(input.maxInstallments, platformMax);
    const rules: StoredPaymentRules = { maxInstallments, maxFreeInstallments: Math.min(input.maxFreeInstallments, maxInstallments), minFreeInstallment: Math.round(input.minFreeInstallment * 100) / 100 };
    await this.prisma.store.update({ where: { id: storeId }, data: { paymentRules: rules as Prisma.InputJsonObject } });
    return this.get(storeId);
  }

  /** Para um valor de pedido, o que o Mercado Pago oferece em cada bandeira e o que o checkout mostra com as regras da loja. */
  async simulate(storeId: string, amount: number) {
    const { limits } = await this.get(storeId);
    if (!this.mercadoPago.configured) return { configured: false, limits, brands: [] as { id: string; name: string; rows: SimulationRow[]; error?: string }[] };
    const brands = await Promise.all(BRANDS.map(async brand => {
      try {
        return { ...brand, rows: simulateInstallments(amount, await this.mercadoPago.brandInstallments(amount, brand.id), limits) };
      } catch {
        return { ...brand, rows: [] as SimulationRow[], error: 'O Mercado Pago não respondeu para esta bandeira.' };
      }
    }));
    return { configured: true, limits, brands };
  }
}
