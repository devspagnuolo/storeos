import { Injectable, Logger } from '@nestjs/common';
import { money } from '../../shared/money/money';
import { CarrierOffer, CarrierPackage, CarrierQuotes } from './carrier';

type SuperFreteService = {
  id: number; name: string; price?: number | string; delivery_time?: number; delivery_range?: { min: number; max: number };
  company?: { name: string }; has_error?: boolean; error?: string;
};

export type SuperFreteAddress = { name: string; address: string; number: string; complement?: string; district: string; city: string; state_abbr: string; postal_code: string; document?: string; email?: string; phone?: string };
export type SuperFreteLabelInput = {
  from: SuperFreteAddress; to: SuperFreteAddress; service: number;
  products: { name: string; quantity: number; unitary_value: number }[];
  volumes: { height: number; width: number; length: number; weight: number };
  options: { insurance_value: number; receipt: boolean; own_hand: boolean; non_commercial: boolean; invoice?: { number: string; key: string } };
  platform: string; tag?: string;
};
export type SuperFreteLabelInfo = { status: string; tracking: string | null; price: number | null };

/** Lê a resposta de /order/info sem confiar no formato: o rastreio pode vir em `tracking` ou `tracking_code`. */
export function parseLabelInfo(info: Record<string, unknown>): SuperFreteLabelInfo {
  const data = (info.data && typeof info.data === 'object' ? info.data : info) as Record<string, unknown>;
  const tracking = [data.tracking, data.tracking_code, data.self_tracking].find(value => typeof value === 'string' && value.trim());
  const price = Number(data.price);
  return { status: String(data.status ?? '').toLowerCase(), tracking: tracking ? String(tracking).trim() : null, price: Number.isFinite(price) ? price : null };
}

/** Mensagem curta do erro do SuperFrete (ex.: saldo insuficiente), sem despejar a resposta inteira. */
export function superFreteError(text: string) {
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown; errors?: unknown };
    const detail = body.errors && typeof body.errors === 'object' ? Object.values(body.errors as Record<string, unknown>).flat().filter(v => typeof v === 'string').join(' ') : '';
    const message = [body.message, body.error].find(v => typeof v === 'string');
    return [message, detail].filter(Boolean).join(' ').slice(0, 300) || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Endereço da API: `SUPERFRETE_API_URL` (https) quando definido; senão o de testes ou o de produção conforme `SUPERFRETE_SANDBOX`. */
export function superFreteHost(env: NodeJS.ProcessEnv = process.env): string {
  const custom = env.SUPERFRETE_API_URL?.trim().replace(/\/+$/, '');
  if (custom && /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(custom)) return custom;
  return env.SUPERFRETE_SANDBOX === 'true' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
}

/**
 * Cotação pela API do SuperFrete (Correios PAC, SEDEX e Mini Envios). Precisa de `SUPERFRETE_TOKEN`; o CEP de origem vem do cadastro da loja (ou, na falta dele, de `SHIPPING_ORIGIN_ZIP`);
 * `SUPERFRETE_API_URL` troca o endereço da API, `SUPERFRETE_SANDBOX=true` usa o ambiente de testes e `SUPERFRETE_SERVICES` troca os serviços cotados (padrão "1,2,17").
 */
@Injectable()
export class SuperFreteClient implements CarrierQuotes {
  readonly provider = 'superfrete';
  private readonly logger = new Logger(SuperFreteClient.name);

  get enabled() {
    return Boolean(process.env.SUPERFRETE_TOKEN);
  }

  private headers() {
    return {
      authorization: `Bearer ${process.env.SUPERFRETE_TOKEN}`, accept: 'application/json', 'content-type': 'application/json',
      // O SuperFrete exige um User-Agent que identifique a aplicação e um contato.
      'user-agent': `StoreOS (${process.env.MAIL_FROM ?? 'contato@storeos.app'})`,
    };
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${superFreteHost()}${path}`, {
      method: init.method ?? 'GET', headers: this.headers(),
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => { throw new Error('Sem resposta do SuperFrete; tentamos de novo em alguns minutos'); });
    const text = await response.text();
    if (!response.ok) throw new Error(`SuperFrete respondeu ${response.status}: ${superFreteError(text)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Lança a etiqueta no carrinho do SuperFrete (ainda sem pagar). Devolve o id da etiqueta. */
  async createLabel(input: SuperFreteLabelInput): Promise<{ id: string; price?: number }> {
    const result = await this.call<{ id?: string | number; price?: number | string }>('/api/v0/cart', { method: 'POST', body: input });
    if (result.id === undefined || result.id === null || result.id === '') throw new Error('SuperFrete não devolveu o número da etiqueta');
    return { id: String(result.id), ...(result.price != null && { price: Number(result.price) }) };
  }

  /** Paga a etiqueta com o saldo da conta SuperFrete. */
  async payLabel(id: string) {
    await this.call('/api/v0/checkout', { method: 'POST', body: { orders: [id] } });
  }

  /** Situação da etiqueta: pending (no carrinho), released (paga, com rastreio), posted, delivered ou canceled. */
  async labelInfo(id: string): Promise<SuperFreteLabelInfo> {
    const info = await this.call<Record<string, unknown>>(`/api/v0/order/info/${encodeURIComponent(id)}`);
    return parseLabelInfo(info);
  }

  /** Link do PDF para imprimir a etiqueta. */
  async printUrl(id: string): Promise<string | null> {
    const result = await this.call<{ url?: string }>('/api/v0/tag/print', { method: 'POST', body: { orders: [id] } });
    return typeof result.url === 'string' && /^https:\/\//.test(result.url) ? result.url : null;
  }

  async quote({ fromZip, toZip, packages }: { fromZip: string; toZip: string; packages: CarrierPackage[] }): Promise<CarrierOffer[]> {
    const host = superFreteHost();
    const response = await fetch(`${host}/api/v0/calculator`, {
      method: 'POST',
      headers: this.headers(),
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
