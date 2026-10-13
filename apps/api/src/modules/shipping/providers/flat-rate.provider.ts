import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { toCents } from '../../../shared/domain/money';
import { QuoteRequest, RawQuote, ShippingProvider } from './shipping-provider';

/** Frete fixo configurável: config = { baseCents, estimatedDays }. */
@Injectable()
export class FlatRateProvider implements ShippingProvider {
  readonly key = 'flat_rate';

  async quote(request: QuoteRequest): Promise<RawQuote[]> {
    const base = Number(request.config.baseCents ?? 2490);
    const days = Number(request.config.estimatedDays ?? 7);
    return [{ serviceCode: null, name: String(request.config.label ?? 'Entrega padrão'), priceCents: base, estimatedDays: days }];
  }
}

/** Tabela por faixa de CEP e peso (ShippingRateRule). */
@Injectable()
export class ZoneTableProvider implements ShippingProvider {
  readonly key = 'zone_table';

  constructor(private readonly prisma: PrismaService) {}

  async quote(request: QuoteRequest): Promise<RawQuote[]> {
    const methodId = String(request.config.methodId ?? '');
    if (!methodId) return [];
    const weight = request.items.reduce((a, i) => a + i.weightGrams * i.quantity, 0);
    const zip = request.destinationZip.replace(/\D/g, '').padStart(8, '0');
    const rule = await this.prisma.shippingRateRule.findFirst({
      where: { methodId, zipFrom: { lte: zip }, zipTo: { gte: zip }, minWeightGrams: { lte: weight }, maxWeightGrams: { gte: weight } },
      orderBy: { price: 'asc' },
    });
    return rule ? [{ serviceCode: null, name: 'Entrega', priceCents: toCents(rule.price), estimatedDays: rule.estimatedDays }] : [];
  }
}
