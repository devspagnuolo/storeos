import { Injectable, Logger } from '@nestjs/common';
import { money } from '../../shared/money/money';
import { CarrierOffer, CarrierPackage, CarrierQuotes } from './carrier';
import { originZip } from './melhor-envio.client';

type SuperFreteService = {
  id: number; name: string; price?: number | string; delivery_time?: number; delivery_range?: { min: number; max: number };
  company?: { name: string }; has_error?: boolean; error?: string;
};

/**
 * Cotação pela API do SuperFrete (Correios PAC, SEDEX e Mini Envios). Precisa de `SUPERFRETE_TOKEN` e `SHIPPING_ORIGIN_ZIP`;
 * `SUPERFRETE_SANDBOX=true` usa o ambiente de testes e `SUPERFRETE_SERVICES` troca os serviços cotados (padrão "1,2,17").
 */
@Injectable()
export class SuperFreteClient implements CarrierQuotes {
  readonly provider = 'superfrete';
  private readonly logger = new Logger(SuperFreteClient.name);

  get enabled() {
    return Boolean(process.env.SUPERFRETE_TOKEN && originZip());
  }

  async quote({ fromZip, toZip, packages }: { fromZip: string; toZip: string; packages: CarrierPackage[] }): Promise<CarrierOffer[]> {
    const host = process.env.SUPERFRETE_SANDBOX === 'true' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
    const response = await fetch(`${host}/api/v0/calculator`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.SUPERFRETE_TOKEN}`, accept: 'application/json', 'content-type': 'application/json',
        // O SuperFrete exige um User-Agent que identifique a aplicação e um contato.
        'user-agent': `StoreOS (${process.env.MAIL_FROM ?? 'contato@storeos.app'})`,
      },
      body: JSON.stringify({
        from: { postal_code: fromZip }, to: { postal_code: toZip },
        services: process.env.SUPERFRETE_SERVICES ?? '1,2,17',
        options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
        products: packages.map(p => ({ quantity: p.quantity, height: p.heightCm, width: p.widthCm, length: p.lengthCm, weight: p.weightKg })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SuperFrete respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const services = (await response.json()) as SuperFreteService[];
    return (Array.isArray(services) ? services : []).flatMap(service => {
      if (service.has_error || service.error || service.price === undefined || service.price === null) {
        this.logger.debug(`Serviço ${service.name} indisponível: ${service.error ?? 'sem preço'}`);
        return [];
      }
      const days = service.delivery_time ?? 0;
      return [{
        id: `sf:${service.id}`, name: service.name.startsWith('Correios') ? service.name : `Correios ${service.name}`, price: money(String(service.price)),
        minDays: service.delivery_range?.min ?? days, maxDays: service.delivery_range?.max ?? days,
      }];
    });
  }
}
