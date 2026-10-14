import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BlingInvoiceStatus } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';

type InvoiceDto = {
  id?: number | string;
  numero?: number | string;
  serie?: number | string;
  chaveAcesso?: string;
  situacao?: number | string | { id?: number | string; valor?: number | string };
  motivo?: string;
  motivoSituacao?: string;
};
type InvoiceList = { data?: InvoiceDto[] };

/**
 * Mantém a nota fiscal separada do pedido do site e do pedido de venda Bling.
 * A criação é feita a partir do pedido de venda no ERP para preservar o vínculo fiscal.
 */
@Injectable()
export class BlingInvoicesService {
  private readonly logger = new Logger(BlingInvoicesService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  @Interval(30_000)
  async tick() {
    if (this.running || process.env.BLING_WORKER === 'off') return;
    this.running = true;
    try {
      await this.enqueueAutomatic();
      await this.processDue();
    } catch (error) {
      this.logger.error('Falha ao processar notas fiscais do Bling', error as Error);
    } finally {
      this.running = false;
    }
  }

  async setAutomatic(storeId: string, enabled: boolean) {
    const connection = await this.prisma.blingConnection.findUnique({ where: { storeId } });
    if (!connection) throw new ServiceUnavailableException('Conecte o Bling antes de alterar a emissão fiscal');
    await this.prisma.blingConnection.update({ where: { storeId }, data: { automaticInvoiceEnabled: enabled, automaticInvoiceEnabledAt: enabled ? new Date() : null } });
    return { automaticInvoiceEnabled: enabled };
  }

  async request(storeId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { storeId, number: orderNumber },
      include: { payments: { where: { status: 'PAID' }, take: 1 }, blingSync: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!order.payments.length) throw new ServiceUnavailableException('A nota só pode ser solicitada depois da confirmação do pagamento');
    if (order.blingSync?.status !== 'SENT' || !order.blingSync.blingOrderId) {
      throw new ServiceUnavailableException('Aguarde o pedido ser registrado no Bling antes de solicitar a nota fiscal');
    }
    const connection = await this.prisma.blingConnection.findUnique({ where: { storeId } });
    if (!connection) throw new ServiceUnavailableException('Bling não conectado');
    const invoice = await this.prisma.blingInvoice.upsert({
      where: { orderId: order.id },
      create: { storeId, orderId: order.id, connectionId: connection.id, status: BlingInvoiceStatus.QUEUED },
      update: {},
    });
    return this.publicInvoice(invoice);
  }

  async setAutomaticInvoiceForStore(storeId: string, enabled: boolean) {
    return this.setAutomatic(storeId, enabled);
  }

  async list(storeId: string) {
    const items = await this.prisma.blingInvoice.findMany({
      where: { storeId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { order: { select: { number: true, total: true } } },
    });
    return items.map(({ order, ...invoice }) => ({
      ...this.publicInvoice(invoice), orderNumber: order.number, total: order.total.toFixed(2),
    }));
  }

  async findForOrder(storeId: string, orderNumber: string) {
    const invoice = await this.prisma.blingInvoice.findFirst({ where: { storeId, order: { number: orderNumber } } });
    return invoice ? this.publicInvoice(invoice) : null;
  }

  async processDue() {
    const due = await this.prisma.blingInvoice.findMany({
      where: { status: { in: [BlingInvoiceStatus.QUEUED, BlingInvoiceStatus.FAILED, BlingInvoiceStatus.PROCESSING, BlingInvoiceStatus.GENERATED] }, attempts: { lt: 6 }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' }, take: 5,
    });
    for (const invoice of due) await this.process(invoice.id);
    return due.length;
  }

  private async enqueueAutomatic() {
    const connections = await this.prisma.blingConnection.findMany({ where: { automaticInvoiceEnabled: true }, select: { id: true, storeId: true, automaticInvoiceEnabledAt: true } });
    for (const connection of connections) {
      const orders = await this.prisma.order.findMany({
        where: { storeId: connection.storeId, createdAt: { gte: connection.automaticInvoiceEnabledAt ?? new Date() }, payments: { some: { status: 'PAID' } }, blingSync: { status: 'SENT', blingOrderId: { not: null } }, blingInvoice: null },
        select: { id: true }, orderBy: { createdAt: 'asc' }, take: 25,
      });
      if (orders.length) await this.prisma.blingInvoice.createMany({
        data: orders.map(order => ({ storeId: connection.storeId, orderId: order.id, connectionId: connection.id })),
        skipDuplicates: true,
      });
    }
  }

  private async process(id: string) {
    const now = new Date();
    const claim = await this.prisma.blingInvoice.updateMany({
      where: { id, status: { in: [BlingInvoiceStatus.QUEUED, BlingInvoiceStatus.FAILED, BlingInvoiceStatus.PROCESSING, BlingInvoiceStatus.GENERATED] }, attempts: { lt: 6 }, nextAttemptAt: { lte: now } },
      data: { status: BlingInvoiceStatus.PROCESSING, nextAttemptAt: new Date(now.getTime() + 5 * 60_000) },
    });
    if (!claim.count) return;
    const invoice = await this.prisma.blingInvoice.findUniqueOrThrow({
      where: { id }, include: { order: { include: { blingSync: true } } },
    });
    try {
      const remoteOrderId = invoice.order.blingSync?.blingOrderId;
      if (!remoteOrderId) throw new Error('Pedido de venda Bling ainda não está vinculado');
      const token = await this.auth.accessToken(invoice.storeId);
      const call = <T>(path: string, init?: { method?: string; body?: unknown }) => this.client.request<T>(token, path, init);

      // Reutiliza IDs persistidos e faz busca por numeroLoja após timeout para evitar notas duplicadas.
      let remote: InvoiceDto | undefined = invoice.blingInvoiceId ? { id: invoice.blingInvoiceId } : undefined;
      if (!remote) {
        const found = (await call<InvoiceList>('/nfe?' + new URLSearchParams({ numeroLoja: invoice.order.number, tipo: '1', limite: '10' }))).data ?? [];
        remote = found.find(row => row.id !== undefined);
      }
      if (!remote) {
        const result = await call<{ data?: { idNotaFiscal?: number | string; id?: number | string } }>('/pedidos/vendas/' + encodeURIComponent(remoteOrderId) + '/gerar-nfe', { method: 'POST' });
        const remoteId = result.data?.idNotaFiscal ?? result.data?.id;
        if (remoteId === undefined || remoteId === null) throw new Error('Bling não retornou o identificador da NF-e');
        remote = { id: remoteId };
      }
      const remoteId = String(remote.id);
      await this.prisma.blingInvoice.update({
        where: { id }, data: { status: BlingInvoiceStatus.GENERATED, blingInvoiceId: remoteId, invoiceNumber: remote.numero == null ? null : String(remote.numero), series: remote.serie == null ? null : String(remote.serie), accessKey: remote.chaveAcesso ?? null, issuedAt: invoice.issuedAt ?? new Date(), rejectionReason: null },
      });

      // Persiste o envio antes de consultar status. Reexecuções só consultam; não reenviam NF-e à SEFAZ.
      if (!invoice.submittedAt) {
        await call('/nfe/' + encodeURIComponent(remoteId) + '/enviar', { method: 'POST', body: { enviarEmail: false } });
        await this.prisma.blingInvoice.update({ where: { id }, data: { submittedAt: new Date() } });
      }
      const detail = await call<{ data?: InvoiceDto }>('/nfe/' + encodeURIComponent(remoteId));
      const data = detail.data ?? remote;
      const situation = typeof data.situacao === 'object' ? data.situacao?.id ?? data.situacao?.valor : data.situacao;
      const authorized = String(situation) === '5' || String(situation) === '6';
      const rejected = String(situation) === '4' || String(situation) === '9';
      const saved = await this.prisma.blingInvoice.update({
        where: { id },
        data: {
          status: authorized ? BlingInvoiceStatus.AUTHORIZED : rejected ? BlingInvoiceStatus.REJECTED : BlingInvoiceStatus.GENERATED,
          invoiceNumber: data.numero == null ? remote.numero == null ? invoice.invoiceNumber : String(remote.numero) : String(data.numero),
          series: data.serie == null ? remote.serie == null ? invoice.series : String(remote.serie) : String(data.serie),
          accessKey: data.chaveAcesso ?? remote.chaveAcesso ?? invoice.accessKey,
          rejectionReason: rejected ? data.motivoSituacao ?? data.motivo ?? 'A NF-e foi rejeitada pelo Bling/SEFAZ.' : null,
          ...(authorized && { authorizedAt: new Date() }),
          nextAttemptAt: authorized || rejected ? new Date('9999-12-31T00:00:00.000Z') : new Date(Date.now() + 5 * 60_000),
        },
      });
      if (authorized) {
        await this.prisma.fulfillment.upsert({
          where: { orderId: invoice.orderId },
          create: { orderId: invoice.orderId, storeId: invoice.storeId, invoiceNumber: saved.invoiceNumber, invoiceKey: saved.accessKey, invoicedAt: saved.authorizedAt ?? new Date() },
          update: { invoiceNumber: saved.invoiceNumber, invoiceKey: saved.accessKey, invoicedAt: saved.authorizedAt ?? new Date() },
        });
        await this.prisma.$transaction(async tx => {
          const changed = await tx.order.updateMany({ where: { id: invoice.orderId, status: 'PICKING' }, data: { status: 'INVOICED' } });
          if (changed.count) await tx.orderTimeline.create({ data: { orderId: invoice.orderId, status: 'INVOICED', message: 'NF-e autorizada pela SEFAZ via Bling.' } });
        });
      }
    } catch (error) {
      const attempts = invoice.attempts + 1;
      const message = (error as Error).message.slice(0, 1000);
      this.logger.warn('NF-e do pedido ' + invoice.order.number + ' não processada: ' + message);
      await this.prisma.blingInvoice.update({
        where: { id },
        data: { status: BlingInvoiceStatus.FAILED, attempts, rejectionReason: message, nextAttemptAt: attempts >= 6 ? new Date('9999-12-31T00:00:00.000Z') : new Date(Date.now() + Math.min(2 ** attempts * 60_000, 6 * 3_600_000)) },
      });
    }
  }

  private publicInvoice<T extends { id: string; orderId: string; status: BlingInvoiceStatus; blingInvoiceId: string | null; invoiceNumber: string | null; series: string | null; accessKey: string | null; rejectionReason: string | null; attempts: number; nextAttemptAt: Date; issuedAt: Date | null; authorizedAt: Date | null; createdAt: Date }>(row: T) {
    return { id: row.id, orderId: row.orderId, status: row.status, blingInvoiceId: row.blingInvoiceId, invoiceNumber: row.invoiceNumber, series: row.series, accessKey: row.accessKey, rejectionReason: row.rejectionReason, attempts: row.attempts, nextAttemptAt: row.nextAttemptAt, issuedAt: row.issuedAt, authorizedAt: row.authorizedAt, createdAt: row.createdAt };
  }
}
