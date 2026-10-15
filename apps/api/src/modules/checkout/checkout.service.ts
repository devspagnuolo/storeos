import { BadGatewayException, BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AbandonedCartStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { generateOrderNumber, inventoryOf, mergeItems, persistLines, priceOrderLines, productsForPricing, RequestedItem } from '../orders/order-lines';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { CardPayment, ChargeResult, PAYMENT_PROVIDER, PaymentProvider, paymentDeadline } from '../payments/payment-provider';
import { clampInstallments, declineMessage, MAX_INSTALLMENTS, InstallmentOffer, installmentProblem, isValidCpf, onlyDigits } from '../payments/payment-rules';
import { MercadoPagoClient } from '../payments/mercado-pago.client';
import { CouponsService } from '../promotions/coupons.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ShippingService } from '../shipping/shipping.service';
import { money } from '../../shared/money/money';

export type ShippingAddress = { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string };
export type CheckoutInput = {
  storeSlug: string;
  customer: { name: string; email: string };
  shippingAddress: ShippingAddress;
  items: RequestedItem[];
  paymentMethod: PaymentMethod;
  shippingRuleId?: string;
  couponCode?: string;
  /** CPF do pagador e dados do cartão já tokenizados no navegador; nada disso é gravado. */
  cpf?: string;
  card?: { token?: string; paymentMethodId?: string; installments?: number; issuerId?: string; bin?: string };
};

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(private readonly prisma: PrismaService, @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider, private readonly lifecycle: OrderLifecycleService, private readonly shipping: ShippingService, private readonly coupons: CouponsService, private readonly promotions: PromotionsService, private readonly mercadoPago: MercadoPagoClient) {}

  /** Oferta real de parcelas do Mercado Pago para o cartão; se a consulta falhar, a regra cai no que é seguro sem juros. */
  private async offersFor(card: CardPayment, bin: string | undefined, total: number): Promise<InstallmentOffer[] | undefined> {
    if (!bin) return undefined;
    try {
      return await this.mercadoPago.installmentOffers({ amount: total, bin, paymentMethodId: card.paymentMethodId, issuerId: card.issuerId });
    } catch (error) {
      this.logger.warn(`Não foi possível consultar as parcelas no Mercado Pago: ${(error as Error).message}`);
      return undefined;
    }
  }

  async checkout(input: CheckoutInput) {
    if (this.payments.supports && !this.payments.supports(input.paymentMethod)) throw new BadRequestException('Este meio de pagamento não está disponível');
    const isCard = input.paymentMethod === PaymentMethod.CREDIT_CARD;
    const cpf = onlyDigits(input.cpf ?? '');
    if (!isValidCpf(cpf)) throw new BadRequestException('Informe um CPF válido');
    // CPF válido acompanha o cliente para emissão fiscal e sincronização com o ERP. Não registramos números inválidos.
    const validCpf = cpf;
    if (isCard && !input.card) throw new BadRequestException('Dados do cartão ausentes');
    let card: CardPayment | undefined;
    let bin: string | undefined;
    if (isCard) {
      // O cartão é tokenizado no navegador pelo Mercado Pago: aqui só chegam o token, a bandeira e o número de parcelas.
      const raw = input.card!;
      if (!raw.token || !raw.paymentMethodId) throw new BadRequestException('Dados do cartão ausentes');
      // Acima do máximo da loja o pedido é recusado em vez de reduzido em silêncio: o cliente pagaria um parcelamento diferente do que viu.
      card = { installments: clampInstallments(raw.installments, MAX_INSTALLMENTS), token: raw.token, paymentMethodId: raw.paymentMethodId, issuerId: raw.issuerId };
      bin = raw.bin && /^\d{6,8}$/.test(raw.bin) ? raw.bin : undefined;
    }
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    if (!store.storefrontOpen) throw new BadRequestException({ message: 'Esta loja ainda não abriu para vendas.', code: 'STORE_CLOSED' });
    const items = mergeItems(input.items);
    const email = input.customer.email.trim().toLowerCase();
    const expiresAt = paymentDeadline(input.paymentMethod);
    const state = this.shipping.stateOrFail(input.shippingAddress.zipCode);
    if (state !== input.shippingAddress.state) throw new BadRequestException('O CEP não corresponde ao estado informado');

    // A cotação nas transportadoras é uma chamada externa: fica fora da transação, que não deve segurar locks.
    const carrierOn = await this.shipping.carrierEnabledFor(store.id);
    const carrierOptions = carrierOn
      ? await this.shipping.carrierOptions(store.id, input.shippingAddress.zipCode, items, await productsForPricing(this.prisma, store.id, items), await this.shipping.hasActiveRules(this.prisma, store.id))
      : [];

    const order = await this.prisma.$transaction(async tx => {
      const products = await productsForPricing(tx, store.id, items);
      const { lines, subtotal } = priceOrderLines(items, products);
      // O frete é recalculado aqui a partir das regras da loja; o cliente só escolhe a opção.
      let shipping = money(0);
      let shippingMethod: string | null = null;
      if ((await this.shipping.hasActiveRules(tx, store.id)) || carrierOn) {
        const options = [...(await this.shipping.optionsFor(tx, store.id, state, subtotal)), ...carrierOptions];
        if (!options.length) throw new BadRequestException('Ainda não entregamos neste CEP');
        const chosen = options.find(option => option.id === input.shippingRuleId);
        if (!chosen) throw new BadRequestException('Escolha uma opção de frete válida');
        shipping = chosen.price;
        shippingMethod = chosen.name;
      }
      for (const item of items) {
        // Reserva atômica: só incrementa se ainda houver saldo livre, evitando venda acima do estoque.
        const reserved = await tx.$executeRaw`UPDATE "Inventory" SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW()
          WHERE "storeId" = ${store.id} AND "productId" = ${item.productId} AND ${inventoryOf(item.variantId)} AND "quantity" - "reserved" >= ${item.quantity}`;
        if (reserved !== 1) {
          const name = lines.find(line => line.productId === item.productId && line.variantId === item.variantId)?.name;
          throw new ConflictException(`Estoque insuficiente para ${name}`);
        }
      }
      const customer = await tx.customer.upsert({
        where: { storeId_email: { storeId: store.id, email } },
        create: { storeId: store.id, email, name: input.customer.name, ...(validCpf && { document: validCpf }) },
        update: { name: input.customer.name, ...(validCpf && { document: validCpf }) },
      });
      // Promoções automáticas entram primeiro; o cupom incide sobre o que sobrou.
      const promo = await this.promotions.evaluate(tx, store.id, lines);
      const afterPromotions = subtotal.minus(promo.discount);
      let discount = money(0);
      let couponId: string | undefined;
      if (input.couponCode?.trim()) {
        const redeemed = await this.coupons.redeem(tx, { storeId: store.id, code: input.couponCode, subtotal, afterPromotions, lines, shipping, customerId: customer.id });
        discount = redeemed.discount;
        couponId = redeemed.coupon.id;
      }
      const total = afterPromotions.minus(discount).plus(shipping);
      // Nenhum gateway cobra R$ 0,00: melhor recusar antes de reservar estoque e criar pedido.
      if (!total.gt(0)) throw new BadRequestException('O total do pedido precisa ser maior que zero. Revise cupom e promoções.');
      const number = generateOrderNumber();
      const created = await tx.order.create({
        data: {
          storeId: store.id, customerId: customer.id, number, status: OrderStatus.AWAITING_PAYMENT, subtotal, discount, promotionDiscount: promo.discount, promotions: promo.applied as unknown as Prisma.InputJsonArray, shipping, total, shippingMethod, couponCode: couponId ? input.couponCode!.trim().toUpperCase() : null,
          shippingAddress: input.shippingAddress as Prisma.InputJsonObject,
          items: { create: persistLines(lines) },
          timeline: { create: [{ status: OrderStatus.NEW, message: 'Pedido criado no checkout', createdAt: new Date() }, { status: OrderStatus.AWAITING_PAYMENT, message: 'Aguardando pagamento', createdAt: new Date(Date.now() + 2) }] },
          payments: { create: { provider: 'pending', method: input.paymentMethod, amount: total, expiresAt } },
        },
        include: { payments: true, items: true },
      });
      // Quem fechou o pedido deixa de ser carrinho abandonado (e não recebe lembrete).
      await tx.abandonedCart.updateMany({ where: { storeId: store.id, email, status: { in: [AbandonedCartStatus.OPEN, AbandonedCartStatus.REMINDED] } }, data: { status: AbandonedCartStatus.RECOVERED, recoveredAt: new Date(), recoveredOrderId: created.id } });
      if (couponId) await tx.couponRedemption.create({ data: { couponId, orderId: created.id, customerId: customer.id, amount: discount } });
      await tx.outboxEvent.create({ data: { storeId: store.id, aggregateType: 'Order', aggregateId: created.id, eventName: 'orders.order-created.v1', payload: { orderNumber: number, customerId: customer.id, total: total.toString(), currency: created.currency } } });
      await tx.outboxEvent.create({ data: { storeId: store.id, aggregateType: 'Order', aggregateId: created.id, eventName: 'inventory.reserved.v1', payload: { orderNumber: number, items } as unknown as Prisma.InputJsonObject } });
      return created;
    });

    // A cobrança fica fora da transação: chamadas a gateways não devem segurar locks no banco.
    const [payment] = order.payments;
    let charge: ChargeResult;
    if (card && card.installments > 1) {
      // A regra de parcelas vale no servidor, não só na tela: confere o pedido final com a oferta real do Mercado Pago para este cartão.
      const problem = installmentProblem(card.installments, Number(order.total), await this.offersFor(card, bin, Number(order.total)));
      if (problem) {
        await this.lifecycle.cancel({ orderId: order.id }, { message: 'Parcelamento recusado pela regra da loja', paymentStatus: PaymentStatus.CANCELLED });
        throw new BadRequestException(problem);
      }
    }
    try {
      charge = await this.payments.createCharge({ storeId: store.id, orderNumber: order.number, amount: order.total.toFixed(2), currency: order.currency, method: input.paymentMethod, expiresAt, customer: { name: input.customer.name, email, cpf, address: input.shippingAddress }, card });
    } catch (error) {
      // Sem cobrança não há como pagar: cancela o pedido e devolve o estoque reservado.
      this.logger.error(`Falha ao gerar cobrança do pedido ${order.number}: ${(error as Error).message}`);
      await this.lifecycle.cancel({ orderId: order.id }, { message: 'Falha ao gerar a cobrança', paymentStatus: PaymentStatus.FAILED });
      throw new BadGatewayException('Não foi possível gerar o pagamento agora. Tente novamente em instantes.');
    }
    if (isCard && (charge.status === PaymentStatus.FAILED || charge.status === PaymentStatus.CANCELLED)) {
      // Cartão recusado na hora: libera o estoque e deixa o cliente tentar de novo com outro cartão.
      await this.prisma.payment.update({ where: { id: payment.id }, data: { provider: charge.provider, transactionId: charge.transactionId, status: charge.status } });
      await this.lifecycle.cancel({ orderId: order.id }, { message: `Cartão recusado (${charge.declineDetail ?? 'sem detalhe'})`, paymentStatus: charge.status });
      throw new HttpException(declineMessage(charge.declineDetail), HttpStatus.PAYMENT_REQUIRED);
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { provider: charge.provider, transactionId: charge.transactionId, status: charge.status, instructions: charge.instructions } });
    let orderStatus: OrderStatus = order.status;
    if (charge.status === PaymentStatus.PAID) {
      // Cartão aprovado na hora: confirma o pedido sem esperar o webhook (que depois não muda nada).
      const paid = await this.lifecycle.markPaid({ orderId: order.id }, { message: 'Pagamento aprovado no cartão' }).catch(error => {
        this.logger.error(`Pedido ${order.number} pago, mas não confirmado: ${(error as Error).message}`);
        return false;
      });
      if (paid) orderStatus = OrderStatus.PAID;
    }

    return {
      number: order.number,
      status: orderStatus,
      subtotal: order.subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      promotionDiscount: order.promotionDiscount.toFixed(2),
      promotions: order.promotions ?? [],
      couponCode: order.couponCode,
      shipping: order.shipping.toFixed(2),
      shippingMethod: order.shippingMethod,
      total: order.total.toFixed(2),
      currency: order.currency,
      items: order.items.map(({ sku, name, quantity, unitPrice, total }) => ({ sku, name, quantity, unitPrice: unitPrice.toFixed(2), total: total.toFixed(2) })),
      payment: { method: input.paymentMethod, status: charge.status, expiresAt: expiresAt.toISOString(), instructions: charge.instructions },
    };
  }
}
