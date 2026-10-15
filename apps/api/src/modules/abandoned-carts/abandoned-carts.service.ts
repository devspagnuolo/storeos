import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AbandonedCart, AbandonedCartStatus, EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { MAIL_PROVIDER, MailProvider } from '../notifications/mail-provider';
import { buildCartReminderMail } from '../notifications/templates';
import { mergeItems, productsForPricing, RequestedItem, variantLabel } from '../orders/order-lines';
import { CartLine, delayMinutes, MAX_AGE_DAYS, sanitizeEmail, stateAfterActivity } from './abandoned-cart-rules';

const BATCH = 25;

@Injectable()
export class AbandonedCartsService {
  private readonly logger = new Logger(AbandonedCartsService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  /** Chamado pelo checkout quando o cliente informa o e-mail: guarda (ou atualiza) o carrinho com preços do catálogo. */
  async capture(input: { storeSlug: string; email: string; name?: string; items: RequestedItem[] }) {
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug }, select: { id: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const email = sanitizeEmail(input.email);
    if (!email) return { captured: false };
    const items = mergeItems(input.items);
    const lines = await this.linesFor(store.id, items);
    if (!lines.length) return { captured: false };
    const existing = await this.prisma.abandonedCart.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
    const next = stateAfterActivity(existing, new Date());
    if (!next) return { captured: false };
    const subtotal = lines.reduce((sum, l) => sum.plus(new Prisma.Decimal(l.price).times(l.quantity)), new Prisma.Decimal(0));
    const data = { name: input.name?.trim().slice(0, 120) || existing?.name || null, items: lines as unknown as Prisma.InputJsonArray, itemCount: lines.reduce((n, l) => n + l.quantity, 0), subtotal, lastActivityAt: new Date(), status: next.status, remindedAt: next.remindedAt };
    await this.prisma.abandonedCart.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email, ...data }, update: data });
    return { captured: true };
  }

  private async linesFor(storeId: string, items: RequestedItem[]): Promise<CartLine[]> {
    const products = await productsForPricing(this.prisma, storeId, items);
    const images = await this.prisma.productImage.findMany({ where: { productId: { in: products.map(p => p.id) } }, orderBy: { position: 'asc' } });
    const lines: CartLine[] = [];
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product || item.quantity < 1) continue;
      const variant = item.variantId ? product.variants.find(v => v.id === item.variantId) : undefined;
      if (item.variantId && !variant) continue;
      const label = variant ? variantLabel(variant.attributes) : '';
      lines.push({
        productId: product.id, ...(variant && { variantId: variant.id, ...(label && { variantLabel: label }) }), slug: product.slug, name: product.name,
        price: (variant?.price ?? product.price).toString(), image: images.find(i => i.productId === product.id)?.url, quantity: Math.min(item.quantity, 99),
      });
    }
    return lines;
  }

  async recover(token: string) {
    const cart = await this.prisma.abandonedCart.findUnique({ where: { token }, include: { store: { select: { slug: true } } } });
    if (!cart || cart.status === AbandonedCartStatus.OPTED_OUT) throw new NotFoundException('Link inválido ou expirado');
    return { storeSlug: cart.store.slug, items: cart.items };
  }

  async optOut(token: string) {
    const result = await this.prisma.abandonedCart.updateMany({ where: { token }, data: { status: AbandonedCartStatus.OPTED_OUT } });
    if (!result.count) throw new NotFoundException('Link inválido ou expirado');
    return { optedOut: true };
  }

  // Disparo -----------------------------------------------------------------------------------------------------------

  @Interval(60_000)
  async tick() {
    if (this.running || process.env.OUTBOX_WORKER === 'off') return;
    this.running = true;
    try {
      const sent = await this.sweep();
      if (sent) this.logger.log(`${sent} lembrete(s) de carrinho enviado(s)`);
    } catch (error) {
      this.logger.error('Falha ao varrer carrinhos abandonados', error as Error);
    } finally {
      this.running = false;
    }
  }

  /** Envia o lembrete dos carrinhos parados. A troca de OPEN para REMINDED é atômica: duas instâncias não enviam duas vezes. */
  async sweep(now = new Date()): Promise<number> {
    const idleBefore = new Date(now.getTime() - delayMinutes() * 60_000);
    const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60_000);
    const due = await this.prisma.abandonedCart.findMany({ where: { status: AbandonedCartStatus.OPEN, remindedAt: null, lastActivityAt: { lte: idleBefore, gte: oldest } }, orderBy: { lastActivityAt: 'asc' }, take: BATCH });
    let sent = 0;
    for (const cart of due) {
      const claimed = await this.prisma.abandonedCart.updateMany({ where: { id: cart.id, status: AbandonedCartStatus.OPEN, remindedAt: null }, data: { status: AbandonedCartStatus.REMINDED, remindedAt: now } });
      if (!claimed.count) continue;
      try {
        await this.deliver(cart);
        sent += 1;
      } catch (error) {
        this.logger.warn(`Lembrete do carrinho ${cart.id} falhou: ${(error as Error).message}`);
        await this.prisma.abandonedCart.updateMany({ where: { id: cart.id, status: AbandonedCartStatus.REMINDED }, data: { status: AbandonedCartStatus.OPEN, remindedAt: null } });
      }
    }
    return sent;
  }

  /** Lembrete manual pelo painel, sem esperar o prazo. */
  async remindNow(storeId: string, id: string) {
    const cart = await this.prisma.abandonedCart.findFirst({ where: { id, storeId } });
    if (!cart) throw new NotFoundException('Carrinho não encontrado');
    if (cart.status === AbandonedCartStatus.OPTED_OUT) throw new ServiceUnavailableException('Esta pessoa pediu para não receber lembretes.');
    if (cart.status === AbandonedCartStatus.RECOVERED) throw new ServiceUnavailableException('Este carrinho já virou pedido.');
    await this.deliver(cart);
    await this.prisma.abandonedCart.update({ where: { id }, data: { status: AbandonedCartStatus.REMINDED, remindedAt: new Date() } });
    return { sent: true };
  }

  /** Endereço público da loja: domínio próprio ativo, senão o endereço padrão configurado. */
  private async siteUrl(storeId: string): Promise<string | null> {
    const domain = await this.prisma.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (domain) return `https://${domain.hostname}`;
    const fallback = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    return fallback ? fallback.replace(/\/$/, '') : null;
  }

  private async deliver(cart: AbandonedCart) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: cart.storeId }, select: { name: true } });
    const site = await this.siteUrl(cart.storeId);
    if (!site) throw new ServiceUnavailableException('Endereço da loja não configurado (PUBLIC_SITE_URL ou domínio ativo)');
    const lines = cart.items as unknown as CartLine[];
    const message = buildCartReminderMail({ storeName: store.name, customerName: cart.name ?? '', items: lines, recoverUrl: `${site}/recuperar/${cart.token}`, optOutUrl: `${site}/recuperar/${cart.token}?sair=1` });
    const from = process.env.MAIL_FROM ?? `${store.name} <pedidos@example.com>`;
    let status: EmailStatus = EmailStatus.SENT; let providerId: string | undefined; let error: string | undefined;
    try {
      const result = await this.mail.send({ to: cart.email, subject: message.subject, text: message.text, html: message.html, from });
      status = result.status; providerId = result.providerId;
    } catch (cause) {
      status = EmailStatus.FAILED; error = (cause as Error).message;
    }
    await this.prisma.emailLog.create({ data: { storeId: cart.storeId, template: message.template, toEmail: cart.email, subject: message.subject, body: message.text, status, error, providerId } });
    if (status === EmailStatus.FAILED) throw new Error(error);
  }

  // Painel ------------------------------------------------------------------------------------------------------------

  async list(storeId: string, pageSize = 50) {
    const [items, groups] = await Promise.all([
      this.prisma.abandonedCart.findMany({ where: { storeId }, orderBy: { lastActivityAt: 'desc' }, take: Math.min(Math.max(pageSize, 1), 100) }),
      this.prisma.abandonedCart.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true }, _sum: { subtotal: true } }),
    ]);
    const stat = (status: AbandonedCartStatus) => groups.find(g => g.status === status);
    return {
      items: items.map(c => ({ id: c.id, email: c.email, name: c.name, status: c.status, itemCount: c.itemCount, subtotal: c.subtotal.toFixed(2), items: c.items, lastActivityAt: c.lastActivityAt, remindedAt: c.remindedAt, recoveredAt: c.recoveredAt })),
      stats: {
        open: stat(AbandonedCartStatus.OPEN)?._count._all ?? 0, reminded: stat(AbandonedCartStatus.REMINDED)?._count._all ?? 0, recovered: stat(AbandonedCartStatus.RECOVERED)?._count._all ?? 0, optedOut: stat(AbandonedCartStatus.OPTED_OUT)?._count._all ?? 0,
        recoveredValue: (stat(AbandonedCartStatus.RECOVERED)?._sum.subtotal ?? new Prisma.Decimal(0)).toFixed(2),
        pendingValue: (stat(AbandonedCartStatus.OPEN)?._sum.subtotal ?? new Prisma.Decimal(0)).plus(stat(AbandonedCartStatus.REMINDED)?._sum.subtotal ?? 0).toFixed(2),
      },
      delayMinutes: delayMinutes(),
      siteConfigured: Boolean(await this.siteUrl(storeId)),
    };
  }
}
