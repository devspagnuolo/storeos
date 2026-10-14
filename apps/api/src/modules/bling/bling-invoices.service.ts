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
    await this.prisma.blingConnection.update({ where: { storeId }, data: { automaticInvoiceEnabled: enabled } });
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

  async processDue() {
    const due = await this.prisma.blingInvoice.findMany({
      where: { status: { in: [BlingInvoiceStatus.QUEUED, BlingInvoiceStatus.FAILED, BlingInvoiceStatus.PROCESSING] }, attempts: { lt: 6 }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' }, take: 5,
    });
    for (const invoice of due) await this.process(invoice.id);
    return due.length;
  }

  private async enqueueAutomatic() {
    const connections = await this.prisma.blingConnection.findMany({ where: { automaticInvoiceEnabled: true }, select: { id: true, storeId: true } });
    for (const connection of connections) {
      const orders = await this.prisma.order.findMany({
        where: { storeId: connection.storeId, payments: { some: { status: 'PAID' } }, blingSync: { status: 'SENT', blingOrderId: { not: null } }, blingInvoice: null },
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
      where: { id, status: { in: [BlingInvoiceStatus.QUEUED, BlingInvoiceStatus.FAILED, BlingInvoiceStatus.PROCESSING] }, attempts: { lt: 6 }, nextAttemptAt: { lte: now } },
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

      // Recuperação idempotente: um timeout após o POST não pode criar uma segunda NF-e.
      const found = (await call<InvoiceList>('/nfe?' + new URLSearchParams({ numeroLoja: invoice.order.number, tipo: '1', limite: '10' }))).data ?? [];
      let remote = found.find(row => row.id !== undefined);
      if (!remote) {
        const result = await call<{ data?: { idNotaFiscal?: number | string; id?: number | string } }>('/pedidos/vendas/' + encodeURIComponent(remoteOrderId) + '/gerar-nfe', { method: 'POST' });
        const remoteId = result.data?.idNotaFiscal ?? result.data?.id;
        if (remoteId === undefined || remoteId === null) throw new Error('Bling não retornou o identificador da NF-e');
        remote = { id: remoteId };
      }
      const remoteId = String(remote.id);
      const generated = await this.prisma.blingInvoice.update({
        where: { id }, data: { status: BlingInvoiceStatus.GENERATED, blingInvoiceId: remoteId, invoiceNumber: remote.numero == null ? null : String(remote.numero), series: remote.serie == null ? null : String(remote.serie), accessKey: remote.chaveAcesso ?? null, issuedAt: new Date(), attempts: { increment: 1 }, rejectionReason: null },
      });
      // Emissão e autorização na SEFAZ são etapas distintas. Esta chamada pede ao Bling o envio/autorização.
      await call('/nfe/' + encodeURIComponent(remoteId) + '/enviar', { method: 'POST', body: { enviarEmail: false } });
      const detail = await call<{ data?: InvoiceDto }>('/nfe/' + encodeURIComponent(remoteId));
      const data = detail.data ?? remote;
      const situation = typeof data.situacao === 'object' ? data.situacao?.id ?? data.situacao?.valor : data.situacao;
      const authorized = String(situation) === '5' || String(situation) === '6';
      await this.prisma.blingInvoice.update({
        where: { id },
        data: {
          status: authorized ? BlingInvoiceStatus.AUTHORIZED : BlingInvoiceStatus.GENERATED,
          invoiceNumber: data.numero == null ? generated.invoiceNumber : String(data.numero),
          series: data.serie == null ? generated.series : String(data.serie),
          accessKey: data.chaveAcesso ?? generated.accessKey,
          rejectionReason: data.motivoSituacao ?? data.motivo ?? null,
          ...(authorized && { authorizedAt: new Date() }),
        },
      });
    } catch (error) {
      const attempts = invoice.attempts + 1;
      const message = (error as Error).message.slice(0, 1000);
      this.logger.warn('NF-e do pedido ' + invoice.order.number + ' não processada: ' + message);
      await this.prisma.blingInvoice.update({
        where: { id },
        data: { status: BlingInvoiceStatus.FAILED, attempts, rejectionReason: message, nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts * 60_000, 6 * 3_600_000)) },
      });
    }
  }

  private publicInvoice<T extends { id: string; orderId: string; status: BlingInvoiceStatus; blingInvoiceId: string | null; invoiceNumber: string | null; series: string | null; accessKey: string | null; rejectionReason: string | null; attempts: number; nextAttemptAt: Date; issuedAt: Date | null; authorizedAt: Date | null; createdAt: Date }>(row: T) {
    return { id: row.id, orderId: row.orderId, status: row.status, blingInvoiceId: row.blingInvoiceId, invoiceNumber: row.invoiceNumber, series: row.series, accessKey: row.accessKey, rejectionReason: row.rejectionReason, attempts: row.attempts, nextAttemptAt: row.nextAttemptAt, issuedAt: row.issuedAt, authorizedAt: row.authorizedAt, createdAt: row.createdAt };
  }
}
