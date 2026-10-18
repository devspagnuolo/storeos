import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { Money, money } from '../../shared/money/money';
import { mergeItems, priceOrderLines, productsForPricing, RequestedItem } from '../orders/order-lines';
import { buildPackages, CARRIER_QUOTES, CarrierQuotes } from './carrier';
import { stateFromZip } from './cep';
import { envOriginZip } from './melhor-envio.client';
import { ShippingOption, shippingOptions } from './shipping-options';

export type ShippingRuleInput = { name: string; states?: string[]; price: number; freeAbove?: number | null; freeOnly?: boolean; minDays: number; maxDays: number; active?: boolean; position?: number };

type Db = Pick<Prisma.TransactionClient, 'shippingRule'>;

const view = (option: ShippingOption) => ({ ...option, price: option.price.toFixed(2) });

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(private readonly prisma: PrismaService, @Inject(CARRIER_QUOTES) private readonly carrier: CarrierQuotes) {}

  /** CEP de onde a loja despacha: o cadastrado no painel; sem ele, o do servidor (SHIPPING_ORIGIN_ZIP). */
  async originZipFor(storeId: string): Promise<{ zip: string; source: 'store' | 'server' | null }> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { shippingOriginZip: true } });
    const own = (store?.shippingOriginZip ?? '').replace(/\D/g, '');
    if (own) return { zip: own, source: 'store' };
    const server = envOriginZip();
    return server ? { zip: server, source: 'server' } : { zip: '', source: null };
  }

  /** Cotação ligada = credenciais da transportadora no servidor + CEP de origem da loja. */
  async carrierEnabledFor(storeId: string) {
    return this.carrier.enabled && Boolean((await this.originZipFor(storeId)).zip);
  }

  async setOriginZip(storeId: string, zip: string | null, extraDays?: number) {
    const digits = (zip ?? '').replace(/\D/g, '');
    if (digits && (digits.length !== 8 || !stateFromZip(digits))) throw new BadRequestException('CEP de origem inválido');
    await this.prisma.store.update({ where: { id: storeId }, data: { shippingOriginZip: digits || null, ...(extraDays !== undefined && { shippingExtraDays: extraDays }) } });
    return this.carrierStatus(storeId);
  }

  /**
   * Opções das transportadoras para o CEP. Se a cotação falhar e a loja tiver regras próprias, segue só com elas;
   * sem regras não há como entregar, então o erro aparece para o cliente tentar de novo.
   */
  async carrierOptions(storeId: string, zipCode: string, items: { productId: string; quantity: number }[], products: Parameters<typeof buildPackages>[1], hasFallback: boolean): Promise<ShippingOption[]> {
    const origin = await this.originZipFor(storeId);
    if (!this.carrier.enabled || !origin.zip) return [];
    try {
      const [offers, extra] = await Promise.all([
        this.carrier.quote({ fromZip: origin.zip, toZip: zipCode.replace(/\D/g, ''), packages: buildPackages(items, products) }),
        this.extraDays(storeId),
      ]);
      // O prazo mostrado é o da transportadora mais os dias de manuseio que a loja definiu.
      return offers.map(offer => ({ ...offer, minDays: offer.minDays + extra, maxDays: offer.maxDays + extra, free: false }));
    } catch (error) {
      this.logger.error(`Cotação de frete falhou: ${(error as Error).message}`);
      if (!hasFallback) throw new ServiceUnavailableException('Não foi possível calcular o frete agora. Tente novamente em instantes.');
      return [];
    }
  }

  /** Cotação pública do carrinho: o subtotal vem sempre do catálogo, nunca do cliente. */
  async quote(storeSlug: string, zipCode: string, items: RequestedItem[]) {
    const store = await this.prisma.store.findUnique({ where: { slug: storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const state = this.stateOrFail(zipCode);
    const merged = mergeItems(items);
    const products = await productsForPricing(this.prisma, store.id, merged);
    const { subtotal } = priceOrderLines(merged, products);
    const [hasRules, ruleOptions] = await Promise.all([this.hasActiveRules(this.prisma, store.id), this.optionsFor(this.prisma, store.id, state, subtotal)]);
    const carrierOptions = await this.carrierOptions(store.id, zipCode, merged, products, hasRules);
    // required=false: a loja não configurou frete e o pedido segue sem custo de envio.
    return { state, subtotal: subtotal.toFixed(2), required: hasRules || (await this.carrierEnabledFor(store.id)), options: [...ruleOptions, ...carrierOptions].map(view) };
  }

  async carrierStatus(storeId: string) {
    const [origin, extraDays] = await Promise.all([this.originZipFor(storeId), this.extraDays(storeId)]);
    return { enabled: this.carrier.enabled && Boolean(origin.zip), credentials: this.carrier.enabled, provider: this.carrier.provider, originZip: origin.zip || null, originSource: origin.source, extraDays };
  }

  private async extraDays(storeId: string) {
    return (await this.prisma.store.findUnique({ where: { id: storeId }, select: { shippingExtraDays: true } }))?.shippingExtraDays ?? 0;
  }

  stateOrFail(zipCode: string) {
    const state = stateFromZip(zipCode);
    if (!state) throw new BadRequestException('CEP inválido');
    return state;
  }

  async optionsFor(db: Db, storeId: string, state: string, subtotal: Money) {
    const rules = await db.shippingRule.findMany({ where: { storeId, active: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    return shippingOptions(rules, state, subtotal);
  }

  /** Lojas sem nenhuma regra ativa vendem sem frete calculado (retirada ou combinado). */
  async hasActiveRules(db: Db, storeId: string) {
    return (await db.shippingRule.count({ where: { storeId, active: true } })) > 0;
  }

  async list(storeId: string) {
    const rules = await this.prisma.shippingRule.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    return rules.map(rule => this.ruleView(rule));
  }

  async create(storeId: string, input: ShippingRuleInput) {
    this.checkDays(input.minDays, input.maxDays);
    const rule = await this.prisma.shippingRule.create({ data: { storeId, ...this.ruleData(input), name: input.name.trim(), price: money(input.price), minDays: input.minDays, maxDays: input.maxDays } });
    return this.ruleView(rule);
  }

  async update(storeId: string, id: string, input: Partial<ShippingRuleInput>) {
    const current = await this.prisma.shippingRule.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundException('Regra de frete não encontrada');
    this.checkDays(input.minDays ?? current.minDays, input.maxDays ?? current.maxDays);
    const rule = await this.prisma.shippingRule.update({ where: { id }, data: this.ruleData(input) });
    return this.ruleView(rule);
  }

  async remove(storeId: string, id: string) {
    const { count } = await this.prisma.shippingRule.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Regra de frete não encontrada');
  }

  private checkDays(minDays: number, maxDays: number) {
    if (maxDays < minDays) throw new BadRequestException('O prazo máximo não pode ser menor que o mínimo');
  }

  private ruleData(input: Partial<ShippingRuleInput>) {
    return {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.states !== undefined && { states: [...new Set(input.states)].sort() }),
      ...(input.price !== undefined && { price: money(input.price) }),
      ...(input.freeAbove !== undefined && { freeAbove: input.freeAbove === null ? null : money(input.freeAbove) }),
      ...(input.freeOnly !== undefined && { freeOnly: input.freeOnly }),
      ...(input.minDays !== undefined && { minDays: input.minDays }),
      ...(input.maxDays !== undefined && { maxDays: input.maxDays }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.position !== undefined && { position: input.position }),
    };
  }

  private ruleView(rule: { id: string; name: string; states: string[]; price: Money; freeAbove: Money | null; freeOnly: boolean; minDays: number; maxDays: number; active: boolean; position: number }) {
    const { id, name, states, minDays, maxDays, active, position, freeOnly } = rule;
    return { id, name, states, freeOnly, price: rule.price.toFixed(2), freeAbove: rule.freeAbove?.toFixed(2) ?? null, minDays, maxDays, active, position };
  }
}
