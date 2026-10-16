import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MAIL_PROVIDER, MailProvider } from '../notifications/mail-provider';
import { statusLabel, trackingLink } from '../orders/tracking-rules';
import { CODE_MAX_ATTEMPTS, CODE_MINUTES, CODES_PER_WINDOW, hashLoginCode, hashSessionToken, loginCodeMail, maskDocument, newLoginCode, newSessionToken, normalizeEmail } from './account-rules';

export type CustomerContext = { sessionId: string; storeId: string; customerId: string };

/** Área do cliente: entrar com código enviado ao e-mail, ver pedidos, dados e pontos. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService, private readonly loyalty: LoyaltyService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  /** Resposta sempre igual, com ou sem cadastro, para não revelar quem compra na loja. */
  async requestCode(storeSlug: string, rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    const store = await this.prisma.store.findUnique({ where: { slug: storeSlug }, select: { id: true, name: true } });
    if (!store) return { sent: true };
    const customer = await this.prisma.customer.findUnique({ where: { storeId_email: { storeId: store.id, email } }, select: { name: true, anonymizedAt: true } });
    if (!customer || customer.anonymizedAt) return { sent: true };
    const recent = await this.prisma.customerLoginCode.count({ where: { storeId: store.id, email, createdAt: { gt: new Date(Date.now() - CODE_MINUTES * 60_000) } } });
    if (recent >= CODES_PER_WINDOW) return { sent: true };
    const { code, hash, expiresAt } = newLoginCode(email);
    // Só o código mais novo vale.
    await this.prisma.customerLoginCode.updateMany({ where: { storeId: store.id, email, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.customerLoginCode.create({ data: { storeId: store.id, email, codeHash: hash, expiresAt } });
    const message = loginCodeMail({ name: customer.name, storeName: store.name, code });
    try {
      const result = await this.mail.send({ to: email, subject: message.subject, text: message.text, html: message.html, from: process.env.MAIL_FROM ?? `${store.name} <pedidos@example.com>` });
      await this.prisma.emailLog.create({ data: { storeId: store.id, template: 'account.login-code', toEmail: email, subject: message.subject.replace(code, '••••••'), body: message.text.replace(code, '••••••'), status: result.status, providerId: result.providerId } });
    } catch (error) {
      this.logger.error(`Falha ao enviar código de acesso: ${(error as Error).message}`);
    }
    return { sent: true };
  }

  async verifyCode(storeSlug: string, rawEmail: string, code: string) {
    const invalid = new BadRequestException('Código inválido ou expirado. Peça um novo código.');
    const email = normalizeEmail(rawEmail);
    const store = await this.prisma.store.findUnique({ where: { slug: storeSlug }, select: { id: true } });
    if (!store) throw invalid;
    const pending = await this.prisma.customerLoginCode.findFirst({ where: { storeId: store.id, email, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!pending || pending.attempts >= CODE_MAX_ATTEMPTS) throw invalid;
    if (pending.codeHash !== hashLoginCode(email, code)) {
      await this.prisma.customerLoginCode.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    // Marca como usado só se ninguém usou antes (duas abas com o mesmo código).
    const claimed = await this.prisma.customerLoginCode.updateMany({ where: { id: pending.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!claimed.count) throw invalid;
    const customer = await this.prisma.customer.findUnique({ where: { storeId_email: { storeId: store.id, email } }, select: { id: true, anonymizedAt: true } });
    if (!customer || customer.anonymizedAt) throw invalid;
    const session = newSessionToken();
    await this.prisma.customerSession.create({ data: { storeId: store.id, customerId: customer.id, tokenHash: session.hash, expiresAt: session.expiresAt } });
    return { token: session.token, expiresAt: session.expiresAt };
  }

  async authenticate(token: string | undefined): Promise<CustomerContext> {
    if (!token) throw new UnauthorizedException('Entre na sua conta.');
    const session = await this.prisma.customerSession.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { customer: { select: { anonymizedAt: true } } } });
    if (!session || session.expiresAt < new Date() || session.customer.anonymizedAt) throw new UnauthorizedException('Sua sessão expirou. Entre de novo.');
    return { sessionId: session.id, storeId: session.storeId, customerId: session.customerId };
  }

  async logout(ctx: CustomerContext) {
    await this.prisma.customerSession.deleteMany({ where: { id: ctx.sessionId } });
    return { ok: true };
  }

  async me(ctx: CustomerContext) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, select: { name: true, email: true, phone: true, document: true, marketingOptIn: true, createdAt: true } });
    const [lastOrder, orders, loyalty] = await Promise.all([
      this.prisma.order.findFirst({ where: { customerId: ctx.customerId }, orderBy: { createdAt: 'desc' }, select: { shippingAddress: true } }),
      this.prisma.order.count({ where: { customerId: ctx.customerId } }),
      this.loyalty.summary(ctx.storeId, ctx.customerId).catch(() => null),
    ]);
    return {
      name: customer.name, email: customer.email, phone: customer.phone, document: maskDocument(customer.document), marketingOptIn: customer.marketingOptIn, since: customer.createdAt,
      orders, address: lastOrder?.shippingAddress ?? null,
      loyalty: loyalty?.enabled ? { balance: loyalty.balance, tier: loyalty.tier, valuePerPoint: loyalty.valuePerPoint, minRedeem: loyalty.minRedeem, entries: loyalty.entries.slice(0, 10) } : null,
    };
  }

  /** Dados completos para o checkout de quem já entrou: CPF sem máscara (vai no pedido e na nota) e o último endereço de entrega. */
  async checkoutProfile(ctx: CustomerContext) {
    const [customer, lastOrder] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, select: { name: true, email: true, phone: true, document: true } }),
      this.prisma.order.findFirst({ where: { customerId: ctx.customerId, storeId: ctx.storeId }, orderBy: { createdAt: 'desc' }, select: { shippingAddress: true } }),
    ]);
    const document = customer.document?.replace(/\D/g, '') ?? '';
    return { name: customer.name, email: customer.email, phone: customer.phone, document: document.length === 11 ? document : null, address: lastOrder?.shippingAddress ?? null };
  }

  async update(ctx: CustomerContext, input: { name?: string; phone?: string | null; marketingOptIn?: boolean }) {
    const name = input.name?.trim();
    if (input.name !== undefined && (!name || name.length < 3)) throw new BadRequestException('Informe seu nome completo.');
    const phone = input.phone === undefined ? undefined : input.phone?.replace(/\D/g, '') || null;
    if (phone && (phone.length < 10 || phone.length > 11)) throw new BadRequestException('Telefone inválido. Use DDD + número.');
    await this.prisma.customer.update({ where: { id: ctx.customerId }, data: { ...(name && { name }), ...(phone !== undefined && { phone }), ...(input.marketingOptIn !== undefined && { marketingOptIn: input.marketingOptIn }) } });
    return this.me(ctx);
  }

  async orders(ctx: CustomerContext) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: ctx.customerId, storeId: ctx.storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { number: true, status: true, total: true, createdAt: true, items: { select: { name: true, quantity: true, product: { select: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } } } },
    });
    return orders.map(order => ({
      number: order.number, status: order.status, statusLabel: statusLabel(order.status), total: order.total.toFixed(2), createdAt: order.createdAt,
      items: order.items.reduce((sum, item) => sum + item.quantity, 0),
      preview: order.items.slice(0, 3).map(item => ({ name: item.name, imageUrl: item.product?.images[0]?.url ?? null })),
    }));
  }

  async order(ctx: CustomerContext, number: string) {
    const order = await this.prisma.order.findFirst({
      where: { customerId: ctx.customerId, storeId: ctx.storeId, number },
      include: {
        items: { include: { product: { select: { slug: true, images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } } },
        timeline: { orderBy: { createdAt: 'asc' }, select: { status: true, createdAt: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        fulfillment: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    const payment = order.payments[0];
    // Pix e boleto ainda dentro do prazo continuam disponíveis para pagar por aqui.
    const payable = payment && order.status === OrderStatus.AWAITING_PAYMENT && payment.status === PaymentStatus.PENDING && (!payment.expiresAt || payment.expiresAt > new Date());
    const f = order.fulfillment;
    return {
      number: order.number, status: order.status, statusLabel: statusLabel(order.status), createdAt: order.createdAt,
      subtotal: order.subtotal.toFixed(2), discount: order.discount.plus(order.promotionDiscount).toFixed(2), shipping: order.shipping.toFixed(2), total: order.total.toFixed(2),
      shippingMethod: order.shippingMethod, couponCode: order.couponCode, address: order.shippingAddress,
      items: order.items.map(item => ({ name: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2), total: item.total.toFixed(2), imageUrl: item.product?.images[0]?.url ?? null, productSlug: item.product?.slug ?? null })),
      payment: payment ? { method: payment.method, status: payment.status, paidAt: payment.paidAt, expiresAt: payment.expiresAt, instructions: payable ? payment.instructions : null } : null,
      timeline: order.timeline.map(entry => ({ status: entry.status, label: statusLabel(entry.status), at: entry.createdAt })),
      tracking: f?.trackingCode ? { carrier: f.carrier, code: f.trackingCode, url: trackingLink(f.trackingCode, f.trackingUrl), shippedAt: f.shippedAt, deliveredAt: f.deliveredAt } : null,
      invoice: f?.invoiceNumber ? { number: f.invoiceNumber, key: f.invoiceKey } : null,
    };
  }

  /** Códigos e sessões vencidos não servem para nada: limpeza periódica. */
  async purgeExpired(now = new Date()) {
    const [codes, sessions] = await Promise.all([
      this.prisma.customerLoginCode.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now.getTime() - 86_400_000) } }, { usedAt: { lt: new Date(now.getTime() - 86_400_000) } }] } }),
      this.prisma.customerSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    return codes.count + sessions.count;
  }
}
