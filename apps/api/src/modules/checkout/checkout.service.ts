import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { generateOrderNumber, mergeItems, priceOrderLines, RequestedItem } from '../orders/order-lines';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { ChargeResult, PAYMENT_PROVIDER, PaymentProvider, paymentDeadline } from '../payments/payment-provider';
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
};

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(private readonly prisma: PrismaService, @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider, private readonly lifecycle: OrderLifecycleService, private readonly shipping: ShippingService) {}

  async checkout(input: CheckoutInput) {
    if (input.paymentMethod === PaymentMethod.CREDIT_CARD) throw new BadRequestException('Cartão de crédito ainda não está disponível');
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const items = mergeItems(input.items);
    const email = input.customer.email.trim().toLowerCase();
    const expiresAt = paymentDeadline(input.paymentMethod);
    const state = this.shipping.stateOrFail(input.shippingAddress.zipCode);
    if (state !== input.shippingAddress.state) throw new BadRequestException('O CEP não corresponde ao estado informado');

    const order = await this.prisma.$transaction(async tx => {
      const products = await tx.product.findMany({ where: { storeId: store.id, id: { in: items.map(i => i.productId) }, status: ProductStatus.ACTIVE } });
      const { lines, subtotal } = priceOrderLines(items, products);
      // O frete é recalculado aqui a partir das regras da loja; o cliente só escolhe a opção.
      let shipping = money(0);
      let shippingMethod: string | null = null;
      if (await this.shipping.hasActiveRules(tx, store.id)) {
        const options = await this.shipping.optionsFor(tx, store.id, state, subtotal);
        if (!options.length) throw new BadRequestException('Ainda não entregamos neste CEP');
        const chosen = options.find(option => option.id === input.shippingRuleId);
        if (!chosen) throw new BadRequestException('Escolha uma opção de frete válida');
        shipping = chosen.price;
        shippingMethod = chosen.name;
      }
      const total = subtotal.plus(shipping);
      for (const item of items) {
        // Reserva atômica: só incrementa se ainda houver saldo livre, evitando venda acima do estoque.
        const reserved = await tx.$executeRaw`UPDATE "Inventory" SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW()
          WHERE "storeId" = ${store.id} AND "productId" = ${item.productId} AND "variantId" IS NULL AND "quantity" - "reserved" >= ${item.quantity}`;
        if (reserved !== 1) {
          const name = lines.find(line => line.productId === item.productId)?.name;
          throw new ConflictException(`Estoque insuficiente para ${name}`);
        }
      }
      const customer = await tx.customer.upsert({
        where: { storeId_email: { storeId: store.id, email } },
        create: { storeId: store.id, email, name: input.customer.name },
        update: { name: input.customer.name },
      });
      const number = generateOrderNumber();
      const created = await tx.order.create({
        data: {
          storeId: store.id, customerId: customer.id, number, status: OrderStatus.AWAITING_PAYMENT, subtotal, shipping, total, shippingMethod,
          shippingAddress: input.shippingAddress as Prisma.InputJsonObject,
          items: { create: lines },
          timeline: { create: [{ status: OrderStatus.NEW, message: 'Pedido criado no checkout' }, { status: OrderStatus.AWAITING_PAYMENT, message: 'Aguardando pagamento' }] },
          payments: { create: { provider: 'pending', method: input.paymentMethod, amount: total, expiresAt } },
        },
        include: { payments: true, items: true },
      });
      await tx.outboxEvent.create({ data: { storeId: store.id, aggregateType: 'Order', aggregateId: created.id, eventName: 'orders.order-created.v1', payload: { orderNumber: number, customerId: customer.id, total: total.toString(), currency: created.currency } } });
      await tx.outboxEvent.create({ data: { storeId: store.id, aggregateType: 'Order', aggregateId: created.id, eventName: 'inventory.reserved.v1', payload: { orderNumber: number, items } as unknown as Prisma.InputJsonObject } });
      return created;
    });

    // A cobrança fica fora da transação: chamadas a gateways não devem segurar locks no banco.
    const [payment] = order.payments;
    let charge: ChargeResult;
    try {
      charge = await this.payments.createCharge({ storeId: store.id, orderNumber: order.number, amount: order.total.toFixed(2), currency: order.currency, method: input.paymentMethod, expiresAt, customer: { name: input.customer.name, email } });
    } catch (error) {
      // Sem cobrança não há como pagar: cancela o pedido e devolve o estoque reservado.
      this.logger.error(`Falha ao gerar cobrança do pedido ${order.number}: ${(error as Error).message}`);
      await this.lifecycle.cancel({ orderId: order.id }, { message: 'Falha ao gerar a cobrança', paymentStatus: PaymentStatus.FAILED });
      throw new BadGatewayException('Não foi possível gerar o pagamento agora. Tente novamente em instantes.');
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { provider: charge.provider, transactionId: charge.transactionId, status: charge.status, instructions: charge.instructions } });

    return {
      number: order.number,
      status: order.status,
      subtotal: order.subtotal.toFixed(2),
      shipping: order.shipping.toFixed(2),
      shippingMethod: order.shippingMethod,
      total: order.total.toFixed(2),
      currency: order.currency,
      items: order.items.map(({ sku, name, quantity, unitPrice, total }) => ({ sku, name, quantity, unitPrice: unitPrice.toFixed(2), total: total.toFixed(2) })),
      payment: { method: input.paymentMethod, status: charge.status, expiresAt: expiresAt.toISOString(), instructions: charge.instructions },
    };
  }
}
