import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { isValidCpf, onlyDigits } from '../payments/payment-rules';
import { OrderLifecycleService } from './order-lifecycle.service';
import { applyPriceOverrides, itemKey, manualTotals } from './manual-order-rules';
import { generateOrderNumber, inventoryOf, mergeItems, persistLines, priceOrderLines, productsForPricing } from './order-lines';

export type ManualOrderInput = {
  customer: { name: string; email: string; phone?: string; document?: string };
  shippingAddress?: { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string };
  items: { productId: string; variantId?: string; quantity: number; unitPrice?: unknown }[];
  paymentMethod: PaymentMethod;
  paid?: boolean;
  discount?: unknown;
  shipping?: unknown;
  shippingMethod?: string;
  note?: string;
};

/** Venda feita fora da vitrine (WhatsApp, telefone, balcão): mesmo estoque, e-mails e fluxo logístico do checkout, sem gateway. */
@Injectable()
export class ManualOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly lifecycle: OrderLifecycleService) {}

  async create(storeId: string, input: ManualOrderInput, actorId?: string) {
    const seen = new Set<string>();
    for (const item of input.items) {
      const key = itemKey(item.productId, item.variantId);
      if (seen.has(key)) throw new BadRequestException('Cada produto (e variação) só pode aparecer uma vez; some as quantidades.');
      seen.add(key);
    }
    const overrides = new Map(input.items.map(item => [itemKey(item.productId, item.variantId), item.unitPrice]));
    const items = mergeItems(input.items);
    const email = input.customer.email.trim().toLowerCase();
    const digits = input.customer.document ? onlyDigits(input.customer.document) : undefined;
    if (digits && !(digits.length === 14 || isValidCpf(digits))) throw new BadRequestException('CPF ou CNPJ inválido.');

    const order = await this.prisma.$transaction(async tx => {
      const products = await productsForPricing(tx, storeId, items);
      const priced = applyPriceOverrides(priceOrderLines(items, products).lines, overrides);
      const { discount, shipping, total } = manualTotals(priced.subtotal, input.discount, input.shipping);
      for (const item of items) {
        const reserved = await tx.$executeRaw`UPDATE "Inventory" SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW()
          WHERE "storeId" = ${storeId} AND "productId" = ${item.productId} AND ${inventoryOf(item.variantId)} AND "quantity" - "reserved" >= ${item.quantity}`;
        if (reserved !== 1) throw new ConflictException(`Estoque insuficiente para ${priced.lines.find(l => l.productId === item.productId && l.variantId === item.variantId)?.name}`);
      }
      const customer = await tx.customer.upsert({
        where: { storeId_email: { storeId, email } },
        create: { storeId, email, name: input.customer.name.trim(), ...(input.customer.phone && { phone: input.customer.phone.trim() }), ...(digits && { document: digits }) },
        update: { name: input.customer.name.trim(), ...(input.customer.phone && { phone: input.customer.phone.trim() }), ...(digits && { document: digits }) },
      });
      const number = generateOrderNumber();
      const notes = [`Pedido manual criado no painel${input.note ? `: ${input.note.trim()}` : ''}`, ...(priced.changed.length ? [`Preço ajustado – ${priced.changed.join('; ')}`] : [])];
      const created = await tx.order.create({
        data: {
          storeId, customerId: customer.id, number, status: OrderStatus.AWAITING_PAYMENT, subtotal: priced.subtotal, discount, shipping, total,
          shippingMethod: input.shippingMethod?.trim() || null,
          ...(input.shippingAddress && { shippingAddress: { ...input.shippingAddress, state: input.shippingAddress.state.toUpperCase() } as Prisma.InputJsonObject }),
          items: { create: persistLines(priced.lines) },
          timeline: { create: [{ status: OrderStatus.NEW, message: notes[0], actorId, createdAt: new Date() }, ...notes.slice(1).map(message => ({ status: OrderStatus.NEW, message, actorId, createdAt: new Date() })), { status: OrderStatus.AWAITING_PAYMENT, message: 'Aguardando pagamento', createdAt: new Date(Date.now() + 2) }] },
          // Sem expiração: o pagamento é combinado direto com o cliente e confirmado no painel.
          payments: { create: { provider: 'manual', method: input.paymentMethod, amount: total } },
        },
      });
      await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Order', aggregateId: created.id, eventName: 'orders.order-created.v1', payload: { orderNumber: number, customerId: customer.id, total: total.toString() } } });
      await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Order', aggregateId: created.id, eventName: 'inventory.reserved.v1', payload: { orderNumber: number, items } as unknown as Prisma.InputJsonObject } });
      return created;
    });
    if (input.paid) await this.lifecycle.markPaid({ orderId: order.id }, { actorId, message: 'Pagamento recebido e registrado no painel' });
    return this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true, customer: true } });
  }
}
