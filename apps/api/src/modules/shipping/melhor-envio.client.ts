import { Injectable, Logger } from '@nestjs/common';
import { money } from '../../shared/money/money';
import { CarrierOffer, CarrierPackage, CarrierQuotes } from './carrier';

type MelhorEnvioService = {
  id: number; name: string; price?: string; custom_price?: string; delivery_time?: number; custom_delivery_time?: number;
  delivery_range?: { min: number; max: number }; company?: { name: string }; error?: string;
};

/**
 * Cotação pela API do Melhor Envio. Precisa de `MELHOR_ENVIO_TOKEN` e `SHIPPING_ORIGIN_ZIP` (CEP de onde a loja despacha);
 * `MELHOR_ENVIO_SANDBOX=true` usa o ambiente de testes deles.
 */
@Injectable()
export class MelhorEnvioClient implements CarrierQuotes {
  readonly provider = 'melhor-envio';
  private readonly logger = new Logger(MelhorEnvioClient.name);

  get enabled() {
    return Boolean(process.env.MELHOR_ENVIO_TOKEN && originZip());
  }

  async quote({ fromZip, toZip, packages }: { fromZip: string; toZip: string; packages: CarrierPackage[] }): Promise<CarrierOffer[]> {
    const host = process.env.MELHOR_ENVIO_SANDBOX === 'true' ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    const response = await fetch(`${host}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`, accept: 'application/json', 'content-type': 'application/json',
        // O Melhor Envio exige um User-Agent que identifique a aplicação e um contato.
        'user-agent': `StoreOS (${process.env.MAIL_FROM ?? 'contato@storeos.app'})`,
      },
      body: JSON.stringify({
        from: { postal_code: fromZip }, to: { postal_code: toZip },
        products: packages.map(p => ({ id: p.id, width: p.widthCm, height: p.heightCm, length: p.lengthCm, weight: p.weightKg, insurance_value: p.unitValue, quantity: p.quantity })),
        options: { receipt: false, own_hand: false },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Melhor Envio respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const services = (await response.json()) as MelhorEnvioService[];
    return services.flatMap(service => {
      const price = service.custom_price ?? service.price;
      if (service.error || price === undefined) {
        if (service.error) this.logger.debug(`Serviço ${service.name} indisponível: ${service.error}`);
        return [];
      }
      const days = service.custom_delivery_time ?? service.delivery_time ?? 0;
      const company = service.company?.name;
      return [{
        id: `me:${service.id}`, name: company && !service.name.includes(company) ? `${company} ${service.name}` : service.name, price: money(price),
        minDays: service.delivery_range?.min ?? days, maxDays: service.delivery_range?.max ?? days,
      }];
    });
  }
}

export const originZip = () => (process.env.SHIPPING_ORIGIN_ZIP ?? '').replace(/\D/g, '');
