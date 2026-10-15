import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CampaignRecipientStatus, EmailCampaignStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { MAIL_PROVIDER, MailProvider } from '../notifications/mail-provider';
import { assertValidCampaign, Audience, AUDIENCES, dedupeRecipients, makeUnsubscribeToken, MAX_RECIPIENTS, normalizeEmail, readUnsubscribeToken, renderCampaignMail } from './campaign-rules';

export type CampaignInput = { name: string; subject: string; body: string; audience: Audience; segment?: string | null };
const MAX_ATTEMPTS = 3;
const batchSize = () => Math.min(20, Math.max(1, Number(process.env.MARKETING_EMAIL_BATCH) || 2));

@Injectable()
export class MarketingCampaignsService {
  private readonly logger = new Logger(MarketingCampaignsService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly customers: CustomersService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  private checkAudience(audience: string) {
    if (!AUDIENCES.includes(audience as Audience)) throw new BadRequestException('Público inválido');
  }

  /** Quem vai receber: inscritos na newsletter (ativos) e/ou clientes com opt-in, sem repetir e-mails. */
  async audience(storeId: string, audience: Audience, segment?: string | null) {
    this.checkAudience(audience);
    const list: { email: string; name?: string | null }[] = [];
    if (audience !== 'CUSTOMERS' && !segment) {
      list.push(...await this.prisma.newsletterSubscriber.findMany({ where: { storeId, unsubscribedAt: null }, select: { email: true, name: true }, take: MAX_RECIPIENTS }));
    }
    if (audience !== 'NEWSLETTER') list.push(...await this.customers.marketingAudience(storeId, segment ?? undefined));
    const people = dedupeRecipients(list);
    // Quem pediu para sair na newsletter não volta pela lista de clientes.
    const opted = await this.prisma.newsletterSubscriber.findMany({ where: { storeId, unsubscribedAt: { not: null }, email: { in: people.map(p => p.email) } }, select: { email: true } });
    const out = new Set(opted.map(o => normalizeEmail(o.email)));
    return people.filter(p => !out.has(p.email)).slice(0, MAX_RECIPIENTS);
  }

  async preview(storeId: string, audience: Audience, segment?: string | null) {
    return { count: (await this.audience(storeId, audience, segment)).length };
  }

  async list(storeId: string) {
    const campaigns = await this.prisma.emailCampaign.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const counts = await this.counts(campaigns.map(c => c.id));
    return campaigns.map(c => ({ ...c, counts: counts.get(c.id) ?? emptyCounts() }));
  }

  private async counts(ids: string[]) {
    const out = new Map<string, ReturnType<typeof emptyCounts>>();
    if (!ids.length) return out;
    const rows = await this.prisma.emailCampaignRecipient.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: true });
    for (const r of rows) {
      const c = out.get(r.campaignId) ?? emptyCounts();
      c.total += r._count;
      if (r.status === CampaignRecipientStatus.PENDING || r.status === CampaignRecipientStatus.SENDING) c.pending += r._count;
      else if (r.status === CampaignRecipientStatus.FAILED) c.failed += r._count;
      else c.sent += r._count;
      if (r.status === CampaignRecipientStatus.SIMULATED) c.simulated += r._count;
      out.set(r.campaignId, c);
    }
    return out;
  }

  async get(storeId: string, id: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({ where: { id, storeId } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    const counts = (await this.counts([id])).get(id) ?? emptyCounts();
    const failures = await this.prisma.emailCampaignRecipient.findMany({ where: { campaignId: id, status: CampaignRecipientStatus.FAILED }, select: { email: true, error: true }, take: 20 });
    return { ...campaign, counts, failures };
  }

  async create(storeId: string, input: CampaignInput) {
    assertValidCampaign(input.subject, input.body);
    this.checkAudience(input.audience);
    return this.prisma.emailCampaign.create({ data: { storeId, name: input.name.trim(), subject: input.subject.trim(), body: input.body.trim(), audience: input.audience, segment: input.segment || null } });
  }

  async update(storeId: string, id: string, input: Partial<CampaignInput>) {
    const current = await this.get(storeId, id);
    if (current.status !== EmailCampaignStatus.DRAFT) throw new BadRequestException('Só dá para editar campanha em rascunho.');
    assertValidCampaign(input.subject ?? current.subject, input.body ?? current.body);
    if (input.audience) this.checkAudience(input.audience);
    await this.prisma.emailCampaign.update({ where: { id }, data: { ...(input.name !== undefined && { name: input.name.trim() }), ...(input.subject !== undefined && { subject: input.subject.trim() }), ...(input.body !== undefined && { body: input.body.trim() }), ...(input.audience !== undefined && { audience: input.audience }), ...(input.segment !== undefined && { segment: input.segment || null }) } });
    return this.get(storeId, id);
  }

  async remove(storeId: string, id: string) {
    const current = await this.get(storeId, id);
    if (current.status === EmailCampaignStatus.SENDING) throw new BadRequestException('Campanha em envio: cancele antes de excluir.');
    await this.prisma.emailCampaign.delete({ where: { id } });
  }

  /** Endereço público da loja: domínio próprio ativo, senão o endereço padrão configurado. */
  private async siteUrl(storeId: string): Promise<string | null> {
    const domain = await this.prisma.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (domain) return `https://${domain.hostname}`;
    const fallback = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    return fallback ? fallback.replace(/\/$/, '') : null;
  }

  private async build(campaign: { subject: string; body: string }, store: { id: string; name: string }, email: string, name: string | null | undefined, site: string) {
    const unsubscribeUrl = `${site}/descadastro/${makeUnsubscribeToken(store.id, email)}`;
    const rendered = renderCampaignMail({ subject: campaign.subject, body: campaign.body, storeName: store.name, recipientName: name, unsubscribeUrl });
    return { ...rendered, from: process.env.MAIL_FROM ?? `${store.name} <novidades@example.com>`, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
  }

  /** Envia a campanha só para um endereço, como confirmação antes de disparar para todo mundo. */
  async sendTest(storeId: string, id: string, email: string) {
    const campaign = await this.get(storeId, id);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, name: true } });
    const site = await this.siteUrl(storeId);
    if (!site) throw new ServiceUnavailableException('Endereço da loja não configurado (PUBLIC_SITE_URL ou domínio ativo).');
    const mail = await this.build(campaign, store, email, 'Maria Silva', site);
    try {
      const result = await this.mail.send({ to: normalizeEmail(email), subject: `[Teste] ${mail.subject}`, text: mail.text, html: mail.html, from: mail.from, headers: mail.headers });
      return { status: result.status };
    } catch (cause) {
      throw new ServiceUnavailableException(`Não foi possível enviar o teste: ${(cause as Error).message}`);
    }
  }

  /** Congela a lista de destinatários e libera o envio em segundo plano. */
  async start(storeId: string, id: string) {
    const campaign = await this.get(storeId, id);
    if (campaign.status !== EmailCampaignStatus.DRAFT) throw new BadRequestException('Esta campanha já foi enviada ou está em envio.');
    if (!(await this.siteUrl(storeId))) throw new ServiceUnavailableException('Endereço da loja não configurado (PUBLIC_SITE_URL ou domínio ativo).');
    const people = await this.audience(storeId, campaign.audience as Audience, campaign.segment);
    if (!people.length) throw new BadRequestException('Nenhum destinatário nesse público.');
    // Só o primeiro a mudar de rascunho para envio cria a lista; clique duplo não duplica.
    const claimed = await this.prisma.emailCampaign.updateMany({ where: { id, storeId, status: EmailCampaignStatus.DRAFT }, data: { status: EmailCampaignStatus.SENDING, startedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException('Esta campanha já foi enviada ou está em envio.');
    await this.prisma.emailCampaignRecipient.createMany({ data: people.map(p => ({ campaignId: id, email: p.email, name: p.name })), skipDuplicates: true });
    return { recipients: people.length };
  }

  async cancel(storeId: string, id: string) {
    const done = await this.prisma.emailCampaign.updateMany({ where: { id, storeId, status: EmailCampaignStatus.SENDING }, data: { status: EmailCampaignStatus.CANCELLED, finishedAt: new Date() } });
    if (!done.count) throw new BadRequestException('Só dá para cancelar uma campanha em envio.');
    return this.get(storeId, id);
  }

  @Interval(1_000)
  async tick() {
    if (process.env.MARKETING_WORKER === 'off') return;
    await this.processDue();
  }

  /** Envia um lote devagar (limite dos provedores) e fecha as campanhas que acabaram. Devolve quantos e-mails tratou. */
  async processDue() {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      // Quem ficou preso em "enviando" (reinício do servidor) volta para a fila.
      await this.prisma.emailCampaignRecipient.updateMany({ where: { status: CampaignRecipientStatus.SENDING, claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { status: CampaignRecipientStatus.PENDING } });
      const batch = await this.prisma.$queryRaw<{ id: string; campaignId: string; email: string; name: string | null; attempts: number }[]>`
        UPDATE "EmailCampaignRecipient" SET "status" = 'SENDING', "claimedAt" = NOW(), "attempts" = "attempts" + 1
        WHERE "id" IN (
          SELECT r."id" FROM "EmailCampaignRecipient" r JOIN "EmailCampaign" c ON c."id" = r."campaignId"
          WHERE r."status" = 'PENDING' AND c."status" = 'SENDING' ORDER BY r."id" LIMIT ${batchSize()} FOR UPDATE OF r SKIP LOCKED)
        RETURNING "id", "campaignId", "email", "name", "attempts"`;
      const cache = new Map<string, { campaign: { subject: string; body: string }; store: { id: string; name: string }; site: string | null }>();
      for (const r of batch) {
        processed++;
        let ctx = cache.get(r.campaignId);
        if (!ctx) {
          const campaign = await this.prisma.emailCampaign.findUniqueOrThrow({ where: { id: r.campaignId }, include: { store: { select: { id: true, name: true } } } });
          ctx = { campaign, store: campaign.store, site: await this.siteUrl(campaign.storeId) };
          cache.set(r.campaignId, ctx);
        }
        await this.deliver(r, ctx);
      }
      await this.finishDone();
    } catch (error) {
      this.logger.error('Falha ao enviar campanhas de e-mail', error as Error);
    } finally {
      this.running = false;
    }
    return processed;
  }

  private async deliver(r: { id: string; email: string; name: string | null; attempts: number; campaignId: string }, ctx: { campaign: { subject: string; body: string }; store: { id: string; name: string }; site: string | null }) {
    try {
      // Pediu para sair depois que a lista foi montada: não envia.
      if (await this.optedOut(ctx.store.id, r.email)) { await this.prisma.emailCampaignRecipient.update({ where: { id: r.id }, data: { status: CampaignRecipientStatus.FAILED, error: 'Descadastrado antes do envio' } }); return; }
      if (!ctx.site) throw new Error('Endereço da loja não configurado');
      const mail = await this.build(ctx.campaign, ctx.store, r.email, r.name, ctx.site);
      const result = await this.mail.send({ to: r.email, subject: mail.subject, text: mail.text, html: mail.html, from: mail.from, headers: mail.headers });
      await this.prisma.emailCampaignRecipient.update({ where: { id: r.id }, data: { status: result.status === 'SENT' ? CampaignRecipientStatus.SENT : CampaignRecipientStatus.SIMULATED, sentAt: new Date(), error: null } });
    } catch (cause) {
      const final = r.attempts >= MAX_ATTEMPTS;
      await this.prisma.emailCampaignRecipient.update({ where: { id: r.id }, data: { status: final ? CampaignRecipientStatus.FAILED : CampaignRecipientStatus.PENDING, error: (cause as Error).message.slice(0, 300) } });
    }
  }

  private async optedOut(storeId: string, email: string) {
    const [news, customer] = await Promise.all([
      this.prisma.newsletterSubscriber.count({ where: { storeId, email: { equals: email, mode: 'insensitive' }, unsubscribedAt: { not: null } } }),
      this.prisma.customer.count({ where: { storeId, email: { equals: email, mode: 'insensitive' }, marketingOptIn: false, anonymizedAt: null } }),
    ]);
    // Cliente sem opt-in só entra na lista se estiver na newsletter ativa; aqui só barramos o descadastro explícito.
    const active = await this.prisma.newsletterSubscriber.count({ where: { storeId, email: { equals: email, mode: 'insensitive' }, unsubscribedAt: null } });
    return news > 0 || (customer > 0 && active === 0);
  }

  private async finishDone() {
    const open = await this.prisma.emailCampaign.findMany({ where: { status: EmailCampaignStatus.SENDING }, select: { id: true } });
    for (const { id } of open) {
      const pending = await this.prisma.emailCampaignRecipient.count({ where: { campaignId: id, status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.SENDING] } } });
      if (!pending) await this.prisma.emailCampaign.updateMany({ where: { id, status: EmailCampaignStatus.SENDING }, data: { status: EmailCampaignStatus.SENT, finishedAt: new Date() } });
    }
  }

  // ---- Descadastro (público) ----

  async unsubscribeInfo(token: string) {
    const data = readUnsubscribeToken(token);
    if (!data) throw new NotFoundException('Link inválido');
    const store = await this.prisma.store.findUnique({ where: { id: data.storeId }, select: { name: true, slug: true } });
    if (!store) throw new NotFoundException('Link inválido');
    const [at, domain] = data.email.split('@');
    return { storeName: store.name, storeSlug: store.slug, email: `${at.slice(0, 2)}***@${domain}` };
  }

  async unsubscribe(token: string) {
    const data = readUnsubscribeToken(token);
    if (!data) throw new NotFoundException('Link inválido');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.updateMany({ where: { storeId: data.storeId, email: { equals: data.email, mode: 'insensitive' }, unsubscribedAt: null }, data: { unsubscribedAt: now } }),
      this.prisma.customer.updateMany({ where: { storeId: data.storeId, email: { equals: data.email, mode: 'insensitive' } }, data: { marketingOptIn: false } }),
    ]);
    return { unsubscribed: true };
  }
}

function emptyCounts() { return { total: 0, sent: 0, simulated: 0, failed: 0, pending: 0 }; }
