import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutInput, CheckoutResult, EventNames } from '@storeos/contracts';
import { BusinessRuleError, ConflictError, ValidationError } from '../../../shared/domain/errors';
import { isValidDocument } from '../../../shared/domain/document';
import { fromCents } from '../../../shared/domain/money';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { EncryptionService, sha256 } from '../../../shared/infrastructure/crypto/encryption.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CartService } from '../../cart/application/cart.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { LoyaltyService } from '../../loyalty/application/loyalty.service';
import { MarketingService } from '../../marketing/application/marketing.service';
import { OrdersService } from '../../orders/application/orders.service';
import { AntifraudService } from '../../payments/application/antifraud.service';
import { PaymentGatewayService } from '../../payments/application/payment-gateway.service';
import { PaymentsService } from '../../payments/application/payments.service';
import { ShippingService } from '../../shipping/application/shipping.service';

interface Meta {
  ip?: string;
  userAgent?: string;
  customerId?: string | null;
  idempotencyKey?: string;
}

const RESERVATION_TTL_MINUTES = { CREDIT_CARD: 20, PIX: 40, BOLETO: 60 * 24 * 3 } as const;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly shipping: ShippingService,
    private readonly marketing: MarketingService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly loyalty: LoyaltyService,
    private readonly gateway: PaymentGatewayService,
    private readonly payments: PaymentsService,
    private readonly antifraud: AntifraudService,
    private readonly crypto: EncryptionService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async place(storeId: string, input: CheckoutInput, meta: Meta): Promise<CheckoutResult> {
    if (!isValidDocument(input.customer.document)) throw new ValidationError('CPF/CNPJ inválido', [{ path: 'customer.document', message: 'Documento inválido' }]);

    // ── Idempotência: o mesmo Idempotency-Key devolve o mesmo resultado, sem cobrar duas vezes ──
    const idem = meta.idempotencyKey ? await this.beginIdempotency(storeId, meta.idempotencyKey, input) : null;
    if (idem?.replay) return idem.replay;

    try {
      const result = await this.execute(storeId, input, meta);
      if (idem) await this.completeIdempotency(idem.id, 201, result);
      return result;
    } catch (err) {
      if (idem) await this.prisma.idempotencyKey.delete({ where: { id: idem.id } }).catch(() => undefined); // permite nova tentativa
      throw err;
    }
  }

  private async execute(storeId: string, input: CheckoutInput, meta: Meta): Promise<CheckoutResult> {
    const cart = await this.carts.load(storeId, input.cartToken);
    if (cart.status === 'CONVERTED') throw new ConflictError('Este carrinho já foi finalizado', 'CART_ALREADY_CONVERTED');
    if (!cart.items.length) throw new BusinessRuleError('Carrinho vazio', 'CART_EMPTY');

    // 1) Preços reais (servidor é a fonte da verdade) e frete revalidado.
    const base = await this.carts.price(storeId, cart, { shippingCents: 0, customerId: meta.customerId });
    if (base.warnings.length || base.lines.length !== cart.items.length) {
      throw new BusinessRuleError(`Seu carrinho mudou: ${base.warnings.join(' ') || 'itens indisponíveis'}`, 'CART_CHANGED');
    }
    const destinationZip = input.shippingAddress.zipCode;
    const net = base.pricing.subtotalCents - base.pricing.discountCents;
    const option = await this.shipping.resolveOption(storeId, input.shippingOptionId, destinationZip, net, this.carts.shippingItems(base));
    if (!option) throw new BusinessRuleError('Opção de frete indisponível. Recalcule o frete.', 'SHIPPING_UNAVAILABLE');

    const priced = await this.carts.price(storeId, cart, { shippingCents: option.priceCents, customerId: meta.customerId });
    let totalCents = priced.pricing.totalCents;

    // 2) Cashback (apenas clientes autenticados).
    let cashbackCents = 0;
    if (input.useCashbackCents > 0) {
      if (!meta.customerId) throw new BusinessRuleError('Entre na sua conta para usar cashback', 'LOGIN_REQUIRED');
      const available = await this.loyalty.maxRedeemableCents(storeId, meta.customerId);
      cashbackCents = Math.min(input.useCashbackCents, available, Math.max(0, totalCents - priced.pricing.shippingCents + priced.pricing.shippingDiscountCents));
      totalCents -= cashbackCents;
    }
    if (totalCents <= 0 && cashbackCents === 0 && priced.pricing.subtotalCents > 0) {
      throw new BusinessRuleError('Valor do pedido inválido', 'INVALID_TOTAL');
    }

    // 3) Antifraude antes de tocar em estoque/cobrança.
    const risk = await this.antifraud.assess({
      storeId,
      email: input.customer.email,
      ip: meta.ip,
      amountCents: totalCents,
      method: input.payment.method,
      customerId: meta.customerId,
      shippingState: input.shippingAddress.state,
      billingState: input.billingAddress?.state,
    });
    if (risk.decision === 'DENY') {
      await this.audit.record({ storeId, action: 'checkout.denied-by-antifraud', metadata: { email: input.customer.email, score: risk.score, reasons: risk.reasons }, actorType: 'SYSTEM' });
      throw new BusinessRuleError('Não foi possível processar o pagamento. Tente outro meio de pagamento ou fale com o atendimento.', 'PAYMENT_DENIED');
    }

    const gateway = await this.gateway.resolve(storeId);
    const document = input.customer.document.replace(/\D/g, '');
    const documentEnc = this.crypto.encrypt(document);
    const documentHash = this.crypto.searchHash(document);

    // 4) Transação do pedido: cliente, pedido, itens, reserva de estoque, cupom, cashback, pagamento.
    const created = await this.prisma.runInTransaction(async (tx) => {
      const customer = await this.upsertCustomer(tx, storeId, input, meta, documentEnc, documentHash);
      const number = await this.orders.nextNumber(tx, storeId);

      const order = await tx.order.create({
        data: {
          storeId,
          number,
          customerId: customer.id,
          cartId: cart.id,
          status: 'AWAITING_PAYMENT',
          paymentStatus: 'PENDING',
          currency: cart.currency,
          subtotal: fromCents(priced.pricing.subtotalCents),
          discountTotal: fromCents(priced.pricing.discountCents),
          shippingTotal: fromCents(priced.pricing.shippingCents - priced.pricing.shippingDiscountCents),
          total: fromCents(totalCents),
          couponCode: priced.coupon?.rule.code,
          cashbackUsed: fromCents(cashbackCents),
          customerEmail: input.customer.email,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerDocumentEnc: documentEnc,
          shippingAddress: input.shippingAddress as Prisma.InputJsonValue,
          billingAddress: (input.billingAddress ?? input.shippingAddress) as Prisma.InputJsonValue,
          shippingMethod: option.name,
          shippingServiceCode: option.serviceCode,
          shippingEstimateDays: option.estimatedDays,
          notes: input.notes,
          utm: input.utm as Prisma.InputJsonValue | undefined,
          items: {
            create: priced.lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              sku: l.sku,
              name: l.name,
              variantName: l.variantName,
              imageUrl: l.imageUrl,
              quantity: l.quantity,
              unitPrice: fromCents(l.unitPriceCents),
              discount: fromCents(l.discountCents),
              total: fromCents(l.totalCents),
            })),
          },
        },
      });

      await this.orders.addTimeline(tx, order.id, { type: 'STATUS_CHANGE', status: 'AWAITING_PAYMENT', message: 'Pedido recebido. Aguardando confirmação do pagamento.', visibleToCustomer: true });
      if (risk.decision === 'REVIEW') {
        await this.orders.addTimeline(tx, order.id, { type: 'SYSTEM', message: `Pedido marcado para revisão antifraude (score ${risk.score}): ${risk.reasons.join('; ')}` });
      }

      await this.inventory.reserve(tx, storeId, priced.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), { type: 'ORDER', id: order.id }, RESERVATION_TTL_MINUTES[input.payment.method]);
      if (priced.coupon) await this.marketing.redeem(tx, { couponId: priced.coupon.id, orderId: order.id, customerId: customer.id, amountCents: priced.pricing.couponDiscountCents });
      if (cashbackCents > 0 && meta.customerId) await this.loyalty.redeemCashback(tx, storeId, meta.customerId, order.id, cashbackCents);
      if (input.referralCode) await this.loyalty.ensureAccount(tx, storeId, customer.id, input.referralCode);

      const payment = await tx.payment.create({
        data: {
          storeId,
          orderId: order.id,
          provider: gateway.provider.key,
          method: input.payment.method === 'CREDIT_CARD' ? 'CREDIT_CARD' : input.payment.method,
          status: 'PENDING',
          amount: fromCents(totalCents),
          currency: cart.currency,
          installments: input.payment.installments,
          fraudScore: risk.score,
          fraudDecision: risk.decision,
          idempotencyKey: `order-${order.id}`,
        },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED', recoveredAt: cart.abandonedAt ? new Date() : null, customerId: customer.id, email: input.customer.email } });
      await this.outbox.enqueue(tx, {
        storeId,
        aggregateType: 'Order',
        aggregateId: order.id,
        eventName: EventNames.ORDER_CREATED,
        payload: { orderId: order.id, orderNumber: order.number, customerId: customer.id, totalCents, currency: order.currency },
      });
      return { order, payment, customerId: customer.id };
    });

    // 5) Cobrança fora da transação (chamada externa). Qualquer falha cancela o pedido e devolve estoque/cupom.
    const { order, payment } = created;
    if (totalCents === 0) {
      await this.orders.markPaid(storeId, order.id, payment.id);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date(), providerStatus: 'covered_by_cashback' } });
      return this.result(order.id, order.number, 'PAID', 0, { paymentId: payment.id, method: input.payment.method, status: 'PAID' });
    }
    let charge;
    try {
      charge = await gateway.provider.createCharge({
        storeId,
        orderId: order.id,
        orderNumber: order.number,
        amountCents: totalCents,
        method: input.payment.method,
        installments: input.payment.installments,
        cardToken: input.payment.cardToken,
        cardPaymentMethodId: input.payment.cardPaymentMethodId,
        payer: { name: input.customer.name, email: input.customer.email, document, phone: input.customer.phone },
        idempotencyKey: `order-${order.id}`,
        notificationUrl: this.payments.notificationUrl(storeId, gateway.provider.key),
        credentials: gateway.credentials,
      });
    } catch (err) {
      this.logger.error(`Cobrança falhou para o pedido ${order.number}: ${(err as Error).message}`);
      await this.cancelAfterFailure(storeId, order.id, 'Falha ao comunicar com o provedor de pagamento');
      await this.reopenCart(cart.id);
      throw new BusinessRuleError('Não foi possível processar o pagamento agora. Tente novamente em instantes.', 'PAYMENT_UNAVAILABLE');
    }

    await this.payments.applyResult(storeId, payment.id, charge);
    if (charge.status === 'FAILED') {
      await this.reopenCart(cart.id);
      throw new BusinessRuleError(`Pagamento recusado${charge.failureReason ? `: ${charge.failureReason}` : ''}. Verifique os dados ou use outro cartão.`, 'PAYMENT_DECLINED');
    }
    const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    return this.result(order.id, order.number, fresh.status, totalCents, {
      paymentId: payment.id,
      method: input.payment.method,
      status: charge.status,
      pixQrCode: charge.pixQrCode,
      pixCopyPaste: charge.pixCopyPaste,
      boletoUrl: charge.boletoUrl,
      boletoBarcode: charge.boletoBarcode,
      expiresAt: charge.expiresAt?.toISOString(),
    });
  }

  private result(orderId: string, orderNumber: string, status: string, totalCents: number, payment: CheckoutResult['payment']): CheckoutResult {
    return { orderId, orderNumber, status, totalCents, trackingToken: this.orders.trackingToken(orderId), payment };
  }

  /** Pedido recusado/cancelado: o carrinho volta a ficar ativo para uma nova tentativa. */
  private async reopenCart(cartId: string): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { status: 'ACTIVE' } }).catch(() => undefined);
  }

  private async cancelAfterFailure(storeId: string, orderId: string, reason: string): Promise<void> {
    await this.prisma
      .runInTransaction((tx) => this.orders.transition(tx, storeId, orderId, 'CANCELLED', { note: reason, reason }))
      .catch((err) => this.logger.error(`Não foi possível cancelar ${orderId}: ${(err as Error).message}`));
  }

  private async upsertCustomer(tx: Prisma.TransactionClient, storeId: string, input: CheckoutInput, meta: Meta, documentEnc: string, documentHash: string) {
    const email = input.customer.email;
    const existing = meta.customerId
      ? await tx.customer.findFirst({ where: { id: meta.customerId, storeId } })
      : await tx.customer.findUnique({ where: { storeId_email: { storeId, email } } });
    const data = { name: input.customer.name, phone: input.customer.phone, documentEnc, documentHash };
    const customer = existing
      ? await tx.customer.update({ where: { id: existing.id }, data: { ...data, acceptsMarketing: input.acceptsMarketing || existing.acceptsMarketing } })
      : await tx.customer.create({ data: { storeId, email, ...data, acceptsMarketing: input.acceptsMarketing, source: 'CHECKOUT' } });

    const a = input.shippingAddress;
    const dup = await tx.address.findFirst({ where: { customerId: customer.id, zipCode: a.zipCode, number: a.number, street: a.street } });
    if (!dup) {
      const count = await tx.address.count({ where: { customerId: customer.id } });
      await tx.address.create({ data: { storeId, customerId: customer.id, type: 'SHIPPING', recipient: a.recipient, zipCode: a.zipCode, street: a.street, number: a.number, complement: a.complement, district: a.district, city: a.city, state: a.state, country: a.country, isDefault: count === 0 } });
    }
    await tx.consent.createMany({
      data: [
        { storeId, customerId: customer.id, purpose: 'TERMS', granted: true, version: '2026-01', ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
        { storeId, customerId: customer.id, purpose: 'MARKETING_EMAIL', granted: input.acceptsMarketing, version: '2026-01', ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
      ],
    });
    return customer;
  }

  // ── idempotência ──

  private async beginIdempotency(storeId: string, key: string, input: CheckoutInput): Promise<{ id: string; replay?: CheckoutResult }> {
    const requestHash = sha256(JSON.stringify({ ...input, payment: { ...input.payment, cardToken: undefined } }));
    try {
      const row = await this.prisma.idempotencyKey.create({ data: { storeId, scope: 'checkout', key, requestHash, expiresAt: new Date(Date.now() + 24 * 3_600_000) } });
      return { id: row.id };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      const row = await this.prisma.idempotencyKey.findUniqueOrThrow({ where: { storeId_scope_key: { storeId, scope: 'checkout', key } } });
      if (row.requestHash !== requestHash) throw new ConflictError('Idempotency-Key reutilizada com outro conteúdo', 'IDEMPOTENCY_KEY_REUSED');
      if (row.completedAt && row.responseBody) return { id: row.id, replay: row.responseBody as unknown as CheckoutResult };
      throw new ConflictError('Requisição idêntica ainda em processamento', 'REQUEST_IN_PROGRESS');
    }
  }

  private completeIdempotency(id: string, status: number, body: CheckoutResult) {
    return this.prisma.idempotencyKey.update({ where: { id }, data: { responseStatus: status, responseBody: body as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
  }
}

