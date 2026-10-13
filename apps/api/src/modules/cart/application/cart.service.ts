import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CartLineView, CartView } from '@storeos/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { toCents } from '../../../shared/domain/money';
import { randomToken } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { MarketingService } from '../../marketing/application/marketing.service';
import { calculatePricing, CouponRule, PricingLine, PricingResult } from '../../marketing/domain/pricing.engine';
import { ShippingService } from '../../shipping/application/shipping.service';

const cartInclude = {
  items: {
    orderBy: { addedAt: 'asc' as const },
    include: {
      variant: { include: { product: { include: { categories: true, media: { orderBy: { position: 'asc' as const }, take: 1 } } }, media: { take: 1 } } },
    },
  },
} satisfies Prisma.CartInclude;

export type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface PricedCart {
  cart: CartRow;
  lines: (CartLineView & { productId: string; categoryIds: string[]; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number; trackInventory: boolean; allowBackorder: boolean; name: string })[];
  pricing: PricingResult;
  coupon: { id: string; rule: CouponRule } | null;
  couponMessage: string | null;
  warnings: string[];
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly marketing: MarketingService,
    private readonly shipping: ShippingService,
  ) {}

  async create(storeId: string, customerId?: string | null): Promise<CartView> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const cart = await this.prisma.cart.create({
      data: { storeId, token: randomToken(24), customerId: customerId ?? null, currency: store.currency, expiresAt: new Date(Date.now() + 30 * 86_400_000) },
    });
    return this.view(storeId, cart.token);
  }

  async load(storeId: string, token: string): Promise<CartRow> {
    const cart = await this.prisma.cart.findFirst({ where: { storeId, token, status: { in: ['ACTIVE', 'ABANDONED'] } }, include: cartInclude });
    if (!cart) throw new NotFoundError('Carrinho não encontrado ou expirado', 'CART_NOT_FOUND');
    return cart;
  }

  async view(storeId: string, token: string, customerId?: string | null): Promise<CartView> {
    const cart = await this.load(storeId, token);
    const priced = await this.price(storeId, cart, { shippingCents: 0, customerId: customerId ?? cart.customerId });
    return this.toView(storeId, priced);
  }

  async addItem(storeId: string, token: string, variantId: string, quantity: number, customerId?: string | null): Promise<CartView> {
    const cart = await this.load(storeId, token);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, active: true, product: { storeId, status: 'ACTIVE', deletedAt: null } },
      include: { product: true },
    });
    if (!variant) throw new NotFoundError('Produto indisponível', 'VARIANT_NOT_FOUND');

    const existing = cart.items.find((i) => i.variantId === variantId);
    const wanted = (existing?.quantity ?? 0) + quantity;
    await this.assertStock(storeId, variant, wanted);

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity },
      update: { quantity: wanted },
    });
    await this.touch(cart.id, customerId);
    return this.view(storeId, token, customerId);
  }

  async setQuantity(storeId: string, token: string, itemId: string, quantity: number, customerId?: string | null): Promise<CartView> {
    const cart = await this.load(storeId, token);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundError('Item não encontrado no carrinho');
    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.assertStock(storeId, item.variant, quantity);
      await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    }
    await this.touch(cart.id, customerId);
    return this.view(storeId, token, customerId);
  }

  async applyCoupon(storeId: string, token: string, code: string, customerId?: string | null): Promise<CartView> {
    const cart = await this.load(storeId, token);
    const check = await this.marketing.validateCoupon(storeId, code, { customerId: customerId ?? cart.customerId, email: cart.email });
    if (!check.ok) throw new BusinessRuleError(check.message, 'COUPON_INVALID');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: check.rule.code } });
    await this.touch(cart.id, customerId);
    return this.view(storeId, token, customerId);
  }

  async removeCoupon(storeId: string, token: string, customerId?: string | null): Promise<CartView> {
    const cart = await this.load(storeId, token);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.view(storeId, token, customerId);
  }

  async setIdentity(storeId: string, token: string, email: string): Promise<void> {
    const cart = await this.load(storeId, token);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { email: email.toLowerCase() } });
  }

  async quoteShipping(storeId: string, token: string, zipCode: string) {
    const cart = await this.load(storeId, token);
    if (!cart.items.length) throw new BusinessRuleError('Carrinho vazio', 'CART_EMPTY');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { shippingZip: zipCode } });
    const priced = await this.price(storeId, cart, { shippingCents: 0, customerId: cart.customerId });
    return this.shipping.quote(storeId, zipCode, priced.pricing.subtotalCents - priced.pricing.discountCents, this.shippingItems(priced));
  }

  /** Une o carrinho anônimo ao do cliente ao fazer login. */
  async attachToCustomer(storeId: string, token: string, customerId: string): Promise<CartView> {
    const cart = await this.load(storeId, token);
    const mine = await this.prisma.cart.findFirst({ where: { storeId, customerId, status: 'ACTIVE', NOT: { id: cart.id } }, include: { items: true }, orderBy: { updatedAt: 'desc' } });
    await this.prisma.runInTransaction(async (tx) => {
      if (mine) {
        for (const item of mine.items) {
          await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
            create: { cartId: cart.id, variantId: item.variantId, quantity: item.quantity },
            update: {},
          });
        }
        await tx.cart.update({ where: { id: mine.id }, data: { status: 'EXPIRED' } });
      }
      await tx.cart.update({ where: { id: cart.id }, data: { customerId } });
    });
    return this.view(storeId, token, customerId);
  }

  // ── precificação (reutilizada pelo checkout) ──

  async price(storeId: string, cart: CartRow, opts: { shippingCents: number; customerId?: string | null }): Promise<PricedCart> {
    const warnings: string[] = [];
    const stock = await this.inventory.availability(storeId, cart.items.map((i) => i.variantId));
    const lines: PricedCart['lines'] = [];
    const pricingLines: PricingLine[] = [];

    for (const item of cart.items) {
      const { variant } = item;
      const product = variant.product;
      if (product.status !== 'ACTIVE' || product.deletedAt || !variant.active) {
        warnings.push(`"${product.name}" não está mais disponível e foi ignorado.`);
        continue;
      }
      const unlimited = !product.trackInventory || product.allowBackorder;
      const available = unlimited ? 9999 : (stock.get(variant.id) ?? 0);
      let quantity = item.quantity;
      if (!unlimited && quantity > available) {
        warnings.push(available > 0 ? `Apenas ${available} unidade(s) de "${product.name}" disponível(is).` : `"${product.name}" está sem estoque.`);
        quantity = Math.max(0, available);
      }
      if (quantity === 0) continue;

      const unit = toCents(variant.price ?? product.price);
      const variantName = Object.values((variant.attributes ?? {}) as Record<string, string>).join(' / ') || null;
      const categoryIds = product.categories.map((c) => c.categoryId);
      lines.push({
        itemId: item.id,
        variantId: variant.id,
        productId: product.id,
        categoryIds,
        slug: product.slug,
        name: product.name,
        variantName,
        sku: variant.sku,
        imageUrl: variant.media[0]?.url ?? product.media[0]?.url ?? null,
        quantity,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit * quantity,
        available,
        weightGrams: variant.weightGrams ?? product.weightGrams,
        lengthMm: product.lengthMm,
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        trackInventory: product.trackInventory,
        allowBackorder: product.allowBackorder,
      });
      pricingLines.push({ key: item.id, productId: product.id, categoryIds, unitPriceCents: unit, quantity });
    }

    let coupon: PricedCart['coupon'] = null;
    let couponMessage: string | null = null;
    if (cart.couponCode) {
      const check = await this.marketing.validateCoupon(storeId, cart.couponCode, { customerId: opts.customerId, email: cart.email });
      if (check.ok) coupon = { id: check.couponId, rule: check.rule };
      else couponMessage = check.message;
    }
    const promotions = await this.marketing.activePromotions(storeId);
    const pricing = calculatePricing({ lines: pricingLines, promotions, coupon: coupon?.rule ?? null, shippingCents: opts.shippingCents });
    if (coupon && !pricing.couponApplied) {
      couponMessage = pricing.couponMessage ?? couponMessage;
      coupon = null;
    }
    for (const line of lines) {
      const d = pricing.lineDiscounts.get(line.itemId) ?? 0;
      line.discountCents = d;
      line.totalCents = line.unitPriceCents * line.quantity - d;
    }
    return { cart, lines, pricing, coupon, couponMessage, warnings };
  }

  shippingItems(priced: PricedCart) {
    return priced.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      weightGrams: l.weightGrams,
      lengthMm: l.lengthMm,
      widthMm: l.widthMm,
      heightMm: l.heightMm,
    }));
  }

  private async toView(storeId: string, priced: PricedCart): Promise<CartView> {
    const threshold = await this.shipping.freeShippingThreshold(storeId);
    const net = priced.pricing.subtotalCents - priced.pricing.discountCents;
    const upsell = await this.upsell(storeId, priced);
    return {
      token: priced.cart.token,
      currency: priced.cart.currency,
      items: priced.lines.map((l) => ({
        itemId: l.itemId,
        variantId: l.variantId,
        productId: l.productId,
        slug: l.slug,
        name: l.name,
        variantName: l.variantName,
        sku: l.sku,
        imageUrl: l.imageUrl,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountCents: l.discountCents,
        totalCents: l.totalCents,
        available: l.available,
      })),
      totals: {
        subtotalCents: priced.pricing.subtotalCents,
        discountCents: priced.pricing.discountCents,
        shippingCents: 0,
        cashbackAppliedCents: 0,
        totalCents: net,
      },
      couponCode: priced.coupon?.rule.code ?? null,
      couponMessage: priced.couponMessage,
      appliedPromotions: priced.pricing.appliedPromotions,
      freeShippingRemainingCents: threshold !== null && net < threshold ? threshold - net : null,
      upsell,
      warnings: priced.warnings,
    };
  }

  /** Cross-sell: mais vendidos das mesmas categorias, fora do carrinho. */
  private async upsell(storeId: string, priced: PricedCart): Promise<CartView['upsell']> {
    if (!priced.lines.length) return [];
    const categoryIds = [...new Set(priced.lines.flatMap((l) => l.categoryIds))];
    const rows = await this.prisma.product.findMany({
      where: {
        storeId,
        status: 'ACTIVE',
        deletedAt: null,
        id: { notIn: priced.lines.map((l) => l.productId) },
        ...(categoryIds.length ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}),
        variants: { some: { active: true } },
      },
      orderBy: [{ soldCount: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      include: { variants: { where: { active: true }, orderBy: { position: 'asc' }, take: 1 }, media: { take: 1, orderBy: { position: 'asc' } } },
    });
    return rows.filter((p) => p.variants[0]).map((p) => ({ variantId: p.variants[0].id, productId: p.id, slug: p.slug, name: p.name, priceCents: toCents(p.variants[0].price ?? p.price), imageUrl: p.media[0]?.url ?? null }));
  }

  private async assertStock(storeId: string, variant: { id: string; sku: string; product: { trackInventory: boolean; allowBackorder: boolean; name: string } }, wanted: number): Promise<void> {
    if (!variant.product.trackInventory || variant.product.allowBackorder) return;
    const available = (await this.inventory.availability(storeId, [variant.id])).get(variant.id) ?? 0;
    if (wanted > available) {
      throw new BusinessRuleError(available > 0 ? `Apenas ${available} unidade(s) disponível(is)` : 'Produto sem estoque', 'INSUFFICIENT_STOCK');
    }
  }

  private touch(cartId: string, customerId?: string | null) {
    return this.prisma.cart.update({
      where: { id: cartId },
      data: { lastActivityAt: new Date(), status: 'ACTIVE', abandonedAt: null, ...(customerId ? { customerId } : {}) },
    });
  }
}
