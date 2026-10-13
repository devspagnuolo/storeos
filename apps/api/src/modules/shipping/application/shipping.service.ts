import { Injectable, Logger } from '@nestjs/common';
import type { ShippingOption } from '@storeos/contracts';
import { toCents } from '../../../shared/domain/money';
import { CacheService } from '../../../shared/infrastructure/cache/cache.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { FlatRateProvider, ZoneTableProvider } from '../providers/flat-rate.provider';
import { MelhorEnvioProvider } from '../providers/melhor-envio.provider';
import { QuoteRequest, ShippingProvider } from '../providers/shipping-provider';

export interface CartShippingItem {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly providers: Map<string, ShippingProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    flat: FlatRateProvider,
    zone: ZoneTableProvider,
    melhorEnvio: MelhorEnvioProvider,
  ) {
    this.providers = new Map([flat, zone, melhorEnvio].map((p) => [p.key, p]));
  }

  /** Cota todos os métodos ativos da loja. Falha em um provedor nunca derruba os demais. */
  async quote(storeId: string, destinationZip: string, subtotalCents: number, items: CartShippingItem[]): Promise<ShippingOption[]> {
    const zip = destinationZip.replace(/\D/g, '');
    const methods = await this.prisma.shippingMethod.findMany({ where: { storeId, active: true }, orderBy: { position: 'asc' } });
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { settings: true } });
    const originZip = ((store?.settings ?? {}) as Record<string, string>).originZip;

    const fingerprint = items.map((i) => `${i.variantId}x${i.quantity}`).sort().join(',');
    const results = await Promise.all(
      methods.map(async (method) => {
        const provider = this.providers.get(method.provider);
        if (!provider) return [];
        const config = { ...((method.config ?? {}) as Record<string, unknown>), methodId: method.id };
        const cacheKey = `shipping:${storeId}:${method.id}:${zip}:${fingerprint}`;
        try {
          const quotes = await this.cache.wrap(cacheKey, 600, () => provider.quote({ storeId, originZip, destinationZip: zip, subtotalCents, items, config } satisfies QuoteRequest));
          const threshold = method.freeShippingThreshold ? toCents(method.freeShippingThreshold) : null;
          return quotes.map<ShippingOption>((q, index) => ({
            id: `${method.id}:${q.serviceCode ?? index}`,
            provider: method.provider,
            serviceCode: q.serviceCode,
            name: method.provider === 'melhor_envio' ? q.name : method.name,
            priceCents: threshold !== null && subtotalCents >= threshold ? 0 : q.priceCents,
            estimatedDays: q.estimatedDays,
          }));
        } catch (err) {
          this.logger.warn(`Cotação ${method.provider} falhou: ${(err as Error).message}`);
          return [];
        }
      }),
    );
    return results.flat().sort((a, b) => a.priceCents - b.priceCents || a.estimatedDays - b.estimatedDays);
  }

  /** Revalida uma opção escolhida no checkout (nunca confiar no preço enviado pelo cliente). */
  async resolveOption(storeId: string, optionId: string, destinationZip: string, subtotalCents: number, items: CartShippingItem[]): Promise<ShippingOption | null> {
    const options = await this.quote(storeId, destinationZip, subtotalCents, items);
    return options.find((o) => o.id === optionId) ?? null;
  }

  async freeShippingThreshold(storeId: string): Promise<number | null> {
    const methods = await this.prisma.shippingMethod.findMany({ where: { storeId, active: true, freeShippingThreshold: { not: null } } });
    const values = methods.map((m) => toCents(m.freeShippingThreshold));
    return values.length ? Math.min(...values) : null;
  }
}
