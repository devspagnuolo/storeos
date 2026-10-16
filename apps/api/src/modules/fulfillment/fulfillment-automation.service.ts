import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus, Prisma, ShippingLabelStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingInvoicesService } from '../bling/bling-invoices.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { ShippingService } from '../shipping/shipping.service';
import { SuperFreteClient } from '../shipping/superfrete.client';
import { buildLabelInput, OrderAddress, senderProblems, ShippingSender, superFreteService } from './fulfillment-rules';

const NEVER = new Date('9999-12-31T00:00:00.000Z');
const MAX_ATTEMPTS = 6;
const RETRYABLE: ShippingLabelStatus[] = [ShippingLabelStatus.PENDING, ShippingLabelStatus.CREATED, ShippingLabelStatus.PAID, ShippingLabelStatus.FAILED];
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

/**
 * Pedido pago anda sozinho nas lojas com a automação ligada:
 * pago → em separação → nota fiscal pelo Bling → etiqueta comprada no SuperFrete (rastreio vai para a cliente) → entregue.
 * Cada passo usa as transições condicionais do pedido, então repetir o ciclo nunca aplica nada duas vezes.
 */
@Injectable()
export class FulfillmentAutomationService {
  private readonly logger = new Logger(FulfillmentAutomationService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService, private readonly lifecycle: OrderLifecycleService, private readonly invoices: BlingInvoicesService,
    private readonly superFrete: SuperFreteClient, private readonly shipping: ShippingService,
  ) {}

  @Interval(60_000)
  async tick() {
    if (this.running || process.env.ORDER_AUTOMATION_WORKER === 'off') return;
    this.running = true;
    try { await this.run(); } catch (error) { this.logger.error('Falha na automação de pedidos', error as Error); } finally { this.running = false; }
  }

  async run() {
    await this.startPicking();
    await this.requestInvoices();
    await this.catchUpInvoiced();
    await this.queueLabels();
    await this.processLabels();
    await this.trackDeliveries();
  }

  private async startPicking() {
    const orders = await this.prisma.order.findMany({ where: { status: OrderStatus.PAID, store: { orderAutomation: true } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 20 });
    for (const order of orders) await this.lifecycle.startPicking({ orderId: order.id }).catch(error => this.logger.warn(`Separação automática falhou: ${(error as Error).message}`));
  }

  /** A nota sai do pedido de venda no Bling; pedido ainda não registrado lá tenta de novo no próximo ciclo. */
  private async requestInvoices() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PICKING, store: { orderAutomation: true, blingConnection: { isNot: null } }, blingInvoice: null, blingSync: { is: { status: 'SENT', blingOrderId: { not: null } } } },
      select: { storeId: true, number: true }, orderBy: { createdAt: 'asc' }, take: 20,
    });
    for (const order of orders) await this.invoices.request(order.storeId, order.number).catch(error => this.logger.warn(`Nota do pedido ${order.number} não solicitada: ${(error as Error).message}`));
  }

  /** Nota autorizada antes da separação (ex.: pedida à mão) fica registrada no pedido; aqui o pedido alcança o "faturado". */
  private async catchUpInvoiced() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PICKING, store: { orderAutomation: true }, fulfillment: { is: { invoiceNumber: { not: null } } } },
      select: { id: true, fulfillment: { select: { invoiceNumber: true, invoiceKey: true } } }, take: 20,
    });
    for (const order of orders) {
      await this.lifecycle.markInvoiced({ orderId: order.id }, { invoiceNumber: order.fulfillment!.invoiceNumber!, invoiceKey: order.fulfillment!.invoiceKey ?? undefined })
        .catch(error => this.logger.warn(`Faturamento automático falhou: ${(error as Error).message}`));
    }
  }

  private async queueLabels() {
    if (!this.superFrete.enabled) return;
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.INVOICED, store: { orderAutomation: true }, shippingLabel: null },
      select: { id: true, storeId: true, shippingOptionId: true, shippingMethod: true }, orderBy: { createdAt: 'asc' }, take: 20,
    });
    const rows = orders.flatMap(order => {
      const service = superFreteService(order);
      return service ? [{ storeId: order.storeId, orderId: order.id, serviceId: String(service) }] : [];
    });
    if (rows.length) await this.prisma.shippingLabel.createMany({ data: rows, skipDuplicates: true });
  }

  private async processLabels() {
    if (!this.superFrete.enabled) return;
    const due = await this.prisma.shippingLabel.findMany({
      where: { status: { in: RETRYABLE }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() }, order: { status: OrderStatus.INVOICED } },
      select: { id: true }, orderBy: { createdAt: 'asc' }, take: 5,
    });
    for (const label of due) await this.processLabel(label.id);
  }

  /** Compra a etiqueta em passos gravados: lança no carrinho, paga com o saldo e, com o rastreio em mãos, marca o pedido como enviado. */
  async processLabel(id: string) {
    const claim = await this.prisma.shippingLabel.updateMany({
      where: { id, status: { in: RETRYABLE }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
      data: { nextAttemptAt: minutes(5) },
    });
    if (!claim.count) return;
    const label = await this.prisma.shippingLabel.findUniqueOrThrow({
      where: { id },
      include: { order: { include: { customer: true, fulfillment: true, items: { include: { product: { select: { weightGrams: true, widthCm: true, heightCm: true, lengthCm: true } } } } } } },
    });
    const { order } = label;
    try {
      let remoteId = label.remoteId;
      if (!remoteId) {
        const store = await this.prisma.store.findUniqueOrThrow({ where: { id: label.storeId }, select: { shippingSender: true } });
        const { zip } = await this.shipping.originZipFor(label.storeId);
        const sender = store.shippingSender as Partial<ShippingSender> | null;
        const missing = senderProblems(sender, zip);
        if (missing.length) throw new Error(`Complete o remetente em Frete: ${missing.join(', ')}`);
        if (!order.customer || !order.shippingAddress) throw new Error('Pedido sem cliente ou endereço de entrega');
        const input = buildLabelInput({
          service: Number(label.serviceId), orderNumber: order.number, sender: sender as ShippingSender, originZip: zip,
          customer: order.customer, address: order.shippingAddress as OrderAddress,
          items: order.items.map(item => ({ name: item.name, quantity: item.quantity, unitPrice: Number(item.unitPrice), product: item.product })),
          invoice: order.fulfillment ? { number: order.fulfillment.invoiceNumber, key: order.fulfillment.invoiceKey } : null,
        });
        const created = await this.superFrete.createLabel(input);
        remoteId = created.id;
        await this.prisma.shippingLabel.update({ where: { id }, data: { remoteId, status: ShippingLabelStatus.CREATED, ...(created.price != null && { price: new Prisma.Decimal(created.price) }) } });
      }
      let info = await this.superFrete.labelInfo(remoteId);
      if (info.status === 'pending') {
        await this.superFrete.payLabel(remoteId);
        await this.prisma.shippingLabel.update({ where: { id }, data: { status: ShippingLabelStatus.PAID, paidAt: new Date() } });
        info = await this.superFrete.labelInfo(remoteId);
      }
      if (info.status === 'canceled' || info.status === 'cancelled') {
        await this.prisma.shippingLabel.update({ where: { id }, data: { status: ShippingLabelStatus.CANCELLED, remoteStatus: info.status, lastError: 'Etiqueta cancelada no SuperFrete', nextAttemptAt: NEVER } });
        return;
      }
      if (!info.tracking) {
        // Paga, mas o rastreio ainda não saiu: consulta de novo em alguns minutos, sem contar como erro.
        await this.prisma.shippingLabel.update({ where: { id }, data: { remoteStatus: info.status, nextAttemptAt: minutes(5) } });
        return;
      }
      const labelUrl = await this.superFrete.printUrl(remoteId).catch(() => null);
      await this.prisma.shippingLabel.update({
        where: { id },
        data: { status: ShippingLabelStatus.RELEASED, remoteStatus: info.status, trackingCode: info.tracking, labelUrl, lastError: null, nextAttemptAt: minutes(60), ...(info.price != null && { price: new Prisma.Decimal(info.price) }), paidAt: label.paidAt ?? new Date() },
      });
      await this.lifecycle.markShipped({ orderId: order.id }, { carrier: 'Correios', trackingCode: info.tracking });
    } catch (error) {
      const attempts = label.attempts + 1;
      const message = (error as Error).message.slice(0, 1000);
      this.logger.warn(`Etiqueta do pedido ${order.number} não emitida: ${message}`);
      await this.prisma.shippingLabel.update({
        where: { id },
        data: { status: ShippingLabelStatus.FAILED, attempts, lastError: message, nextAttemptAt: attempts >= MAX_ATTEMPTS ? NEVER : minutes(Math.min(2 ** attempts * 5, 360)) },
      });
    }
  }

  /** Pedidos enviados com etiqueta: quando o SuperFrete marca entregue, o site atualiza e a cliente recebe o e-mail de entrega. */
  private async trackDeliveries() {
    if (!this.superFrete.enabled) return;
    const labels = await this.prisma.shippingLabel.findMany({
      where: { status: ShippingLabelStatus.RELEASED, remoteId: { not: null }, nextAttemptAt: { lte: new Date() }, order: { status: OrderStatus.SHIPPED } },
      select: { id: true, orderId: true, remoteId: true }, orderBy: { nextAttemptAt: 'asc' }, take: 20,
    });
    for (const label of labels) {
      try {
        const info = await this.superFrete.labelInfo(label.remoteId!);
        if (info.status === 'delivered') {
          await this.lifecycle.markDelivered({ orderId: label.orderId });
          await this.prisma.shippingLabel.update({ where: { id: label.id }, data: { status: ShippingLabelStatus.DELIVERED, remoteStatus: info.status, deliveredAt: new Date(), nextAttemptAt: NEVER } });
        } else {
          await this.prisma.shippingLabel.update({ where: { id: label.id }, data: { remoteStatus: info.status, nextAttemptAt: minutes(60) } });
        }
      } catch (error) {
        this.logger.warn(`Entrega da etiqueta ${label.remoteId} não consultada: ${(error as Error).message}`);
        await this.prisma.shippingLabel.update({ where: { id: label.id }, data: { nextAttemptAt: minutes(60) } });
      }
    }
  }

  /** Painel: gera (ou tenta de novo) a etiqueta de um pedido faturado, mesmo com a automação desligada. */
  async requestLabel(storeId: string, number: string) {
    if (!this.superFrete.enabled) throw new BadRequestException('SuperFrete não configurado no servidor (SUPERFRETE_TOKEN)');
    const order = await this.prisma.order.findUnique({ where: { storeId_number: { storeId, number } }, select: { id: true, status: true, shippingOptionId: true, shippingMethod: true, shippingLabel: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== OrderStatus.INVOICED) throw new BadRequestException('A etiqueta é gerada depois da nota fiscal (pedido faturado)');
    const service = superFreteService(order);
    if (!service) throw new BadRequestException('O frete deste pedido não é dos Correios pelo SuperFrete');
    if (order.shippingLabel && !RETRYABLE.includes(order.shippingLabel.status)) throw new BadRequestException('Este pedido já tem etiqueta');
    const label = await this.prisma.shippingLabel.upsert({
      where: { orderId: order.id },
      create: { storeId, orderId: order.id, serviceId: String(service) },
      update: { attempts: 0, nextAttemptAt: new Date() },
    });
    await this.processLabel(label.id);
    return this.prisma.shippingLabel.findUnique({ where: { id: label.id } });
  }

  async settings(storeId: string) {
    const [store, origin, bling] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { orderAutomation: true, shippingSender: true } }),
      this.shipping.originZipFor(storeId),
      this.prisma.blingConnection.findUnique({ where: { storeId }, select: { id: true } }),
    ]);
    const sender = (store.shippingSender as Partial<ShippingSender> | null) ?? null;
    return { enabled: store.orderAutomation, sender, missing: senderProblems(sender, origin.zip), superFrete: this.superFrete.enabled, bling: Boolean(bling) };
  }

  async saveSettings(storeId: string, input: { enabled?: boolean; sender?: ShippingSender }) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: { ...(input.enabled !== undefined && { orderAutomation: input.enabled }), ...(input.sender && { shippingSender: input.sender as unknown as Prisma.InputJsonObject }) },
    });
    return this.settings(storeId);
  }
}
