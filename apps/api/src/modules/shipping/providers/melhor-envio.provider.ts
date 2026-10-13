import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import { toCents } from '../../../shared/domain/money';
import { HttpClient } from '../../../shared/infrastructure/http/http-client';
import { buildPackage, QuoteRequest, RawQuote, ShippingProvider } from './shipping-provider';

interface MelhorEnvioService {
  id: number;
  name: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  custom_delivery_time?: number;
  error?: string;
  company?: { name: string };
}

/**
 * Melhor Envio (agrega Correios, Jadlog, Loggi, J&T, Total Express…).
 * Docs: POST /api/v2/me/shipment/calculate. Token em MELHOR_ENVIO_TOKEN ou config.token.
 * config.services = "1,2,3,4" filtra serviços; config.sandbox = true usa o ambiente de testes.
 */
@Injectable()
export class MelhorEnvioProvider implements ShippingProvider {
  readonly key = 'melhor_envio';
  private readonly logger = new Logger(MelhorEnvioProvider.name);

  constructor(
    private readonly http: HttpClient,
    private readonly config: AppConfig,
  ) {}

  async quote(request: QuoteRequest): Promise<RawQuote[]> {
    const token = (request.config.token as string | undefined) ?? this.config.env.MELHOR_ENVIO_TOKEN;
    const origin = (request.config.originZip as string | undefined) ?? request.originZip;
    if (!token || !origin) return [];
    const base = request.config.sandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    const pkg = buildPackage(request.items);

    const response = await this.http.request<MelhorEnvioService[]>({
      method: 'POST',
      url: `${base}/api/v2/me/shipment/calculate`,
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'STOREOS (contato@storeos.dev)', 'content-type': 'application/json' },
      timeoutMs: 12_000,
      body: {
        from: { postal_code: origin.replace(/\D/g, '') },
        to: { postal_code: request.destinationZip.replace(/\D/g, '') },
        package: {
          height: Math.ceil(pkg.heightMm / 10),
          width: Math.ceil(pkg.widthMm / 10),
          length: Math.ceil(pkg.lengthMm / 10),
          weight: pkg.weightGrams / 1000,
        },
        options: { insurance_value: pkg.insuranceCents / 100, receipt: false, own_hand: false },
        services: (request.config.services as string | undefined) ?? undefined,
      },
    });
    if (!response.ok || !Array.isArray(response.data)) {
      this.logger.warn(`Melhor Envio respondeu ${response.status}`);
      return [];
    }
    return response.data
      .filter((s) => !s.error && (s.custom_price ?? s.price) !== undefined)
      .map((s) => ({
        serviceCode: String(s.id),
        name: `${s.company?.name ?? ''} ${s.name}`.trim(),
        priceCents: toCents(String(s.custom_price ?? s.price)),
        estimatedDays: Number(s.custom_delivery_time ?? s.delivery_time ?? 7),
      }));
  }
}
