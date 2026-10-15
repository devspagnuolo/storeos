import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AutomationRunStatus, CouponType, EmailStatus, LoyaltyEntryType, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { makeUnsubscribeToken, renderCampaignMail } from '../marketing/campaign-rules';
import { MAIL_PROVIDER, MailProvider } from '../notifications/mail-provider';
import { Action, Conditions, describeAction, fillTemplate, isTrigger, normalizeTag, orderStillValid, PRESETS, RuleInput, Trigger, TRIGGERS, validateRule } from './automation-rules';

const BATCH = 10;
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 5;
const STALE_MINUTES = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type State = { done?: number; coupon?: string };
type Claimed = { id: string };

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  // ---------- cadastro das regras ----------

  private view(rule: { id: string; name: string; active: boolean; trigger: string; conditions: Prisma.JsonValue; delayMinutes: number; actions: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
    const actions = rule.actions as unknown as Action[];
    return { ...rule, conditions: rule.conditions as Conditions, actions, triggerLabel: isTrigger(rule.trigger) ? TRIGGERS[rule.trigger] : rule.trigger, summary: actions.map(describeAction) };
  }

  async list(storeId: string) {
    const rules = await this.prisma.automationRule.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } });
    const counts = await this.prisma.automationRun.groupBy({ by: ['ruleId', 'status'], where: { storeId }, _count: { _all: true } });
    return rules.map(rule => ({
      ...this.view(rule),
      runs: Object.fromEntries(['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED'].map(s => [s, counts.find(c => c.ruleId === rule.id && c.status === s)?._count._all ?? 0])),
    }));
  }

  presets() { return PRESETS; }

  private assertValid(input: RuleInput) {
    const error = validateRule(input);
    if (error) throw new BadRequestException(error);
  }

  private clean(input: RuleInput): RuleInput {
    return {
      name: input.name.trim(), trigger: input.trigger, delayMinutes: input.delayMinutes ?? 0, conditions: input.conditions ?? {},
      actions: input.actions.map(a => (a.type === 'ADD_TAG' || a.type === 'REMOVE_TAG' ? { ...a, tag: normalizeTag(a.tag) } : a)),
    };
  }

  async create(storeId: string, input: RuleInput, active = false) {
    this.assertValid(input);
    const data = this.clean(input);
    const rule = await this.prisma.automationRule.create({ data: { storeId, name: data.name, trigger: data.trigger, delayMinutes: data.delayMinutes ?? 0, conditions: (data.conditions ?? {}) as Prisma.InputJsonObject, actions: data.actions as unknown as Prisma.InputJsonArray, active } });
    return this.view(rule);
  }

  async createFromPreset(storeId: string, key: string) {
    const preset = PRESETS.find(p => p.key === key);
    if (!preset) throw new NotFoundException('Modelo não encontrado');
    return this.create(storeId, preset.rule, false); // nasce desligado: o lojista confere o texto antes de ligar
  }

  async update(storeId: string, id: string, patch: Partial<RuleInput> & { active?: boolean }) {
    const current = await this.prisma.automationRule.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundException('Automação não encontrada');
    const merged: RuleInput = {
      name: patch.name ?? current.name, trigger: patch.trigger ?? current.trigger, delayMinutes: patch.delayMinutes ?? current.delayMinutes,
      conditions: patch.conditions ?? (current.conditions as Conditions), actions: patch.actions ?? (current.actions as unknown as Action[]),
    };
    this.assertValid(merged);
    const data = this.clean(merged);
    const rule = await this.prisma.automationRule.update({ where: { id }, data: { name: data.name, trigger: data.trigger, delayMinutes: data.delayMinutes, conditions: data.conditions as Prisma.InputJsonObject, actions: data.actions as unknown as Prisma.InputJsonArray, ...(patch.active !== undefined && { active: patch.active }) } });
    return this.view(rule);
  }

  async remove(storeId: string, id: string) {
    const done = await this.prisma.automationRule.deleteMany({ where: { id, storeId } });
    if (!done.count) throw new NotFoundException('Automação não encontrada');
    return { deleted: true };
  }

  async runs(storeId: string, ruleId?: string) {
    const rows = await this.prisma.automationRun.findMany({ where: { storeId, ...(ruleId && { ruleId }) }, orderBy: { createdAt: 'desc' }, take: 60, include: { rule: { select: { name: true } } } });
    const customers = await this.prisma.customer.findMany({ where: { id: { in: rows.flatMap(r => (r.customerId ? [r.customerId] : [])) } }, select: { id: true, name: true, email: true, anonymizedAt: true } });
    const orders = await this.prisma.order.findMany({ where: { id: { in: rows.flatMap(r => (r.orderId ? [r.orderId] : [])) } }, select: { id: true, number: true } });
    return rows.map(r => {
      const customer = customers.find(c => c.id === r.customerId);
      return { id: r.id, rule: r.rule.name, status: r.status, runAt: r.runAt, finishedAt: r.finishedAt, attempts: r.attempts, result: r.result, customer: customer && !customer.anonymizedAt ? { name: customer.name, email: customer.email } : null, orderNumber: orders.find(o => o.id === r.orderId)?.number ?? null };
    });
  }

  // ---------- execução ----------

  @Interval(15_000)
  async tick() {
    if (this.running || process.env.OUTBOX_WORKER === 'off' || process.env.AUTOMATION_WORKER === 'off') return;
    this.running = true;
    try { await this.processDue(); } catch (error) { this.logger.error('Falha ao processar automações', error as Error); } finally { this.running = false; }
  }

  /** Pega as execuções vencidas (uma instância por execução) e roda cada uma. */
  async processDue(): Promise<number> {
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      UPDATE "AutomationRun" SET "status" = 'RUNNING', "startedAt" = NOW(), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "AutomationRun"
        WHERE ("status" = 'PENDING' AND "runAt" <= NOW()) OR ("status" = 'RUNNING' AND "startedAt" < NOW() - make_interval(mins => ${STALE_MINUTES}::int))
        ORDER BY "runAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    for (const { id } of claimed) await this.execute(id);
    return claimed.length;
  }

  private async finish(id: string, status: AutomationRunStatus, result: string, state?: State) {
    await this.prisma.automationRun.update({ where: { id }, data: { status, result: result.slice(0, 500), finishedAt: new Date(), ...(state && { state: state as Prisma.InputJsonObject }) } });
  }

  private async execute(runId: string) {
    const run = await this.prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { rule: true } });
    const state = (run.state ?? {}) as State;
    const trigger = run.rule.trigger as Trigger;
    try {
      if (!run.rule.active) return await this.finish(run.id, AutomationRunStatus.SKIPPED, 'Automação desligada antes da execução', state);
      const [order, customer] = await Promise.all([
        run.orderId ? this.prisma.order.findUnique({ where: { id: run.orderId }, select: { number: true, total: true, status: true } }) : null,
        run.customerId ? this.prisma.customer.findFirst({ where: { id: run.customerId, storeId: run.storeId } }) : null,
      ]);
      if (!customer || customer.anonymizedAt) return await this.finish(run.id, AutomationRunStatus.SKIPPED, 'Cliente removido ou anonimizado', state);
      if (order && !orderStillValid(trigger, order.status)) return await this.finish(run.id, AutomationRunStatus.SKIPPED, `Pedido ${order.number} foi encerrado (${order.status}) antes da execução`, state);
      const actions = run.rule.actions as unknown as Action[];
      const notes: string[] = [];
      for (let i = state.done ?? 0; i < actions.length; i++) {
        const note = await this.perform(actions[i], { storeId: run.storeId, ruleName: run.rule.name, customer, order, state });
        if (note) notes.push(note);
        state.done = i + 1;
        await this.prisma.automationRun.update({ where: { id: run.id }, data: { state: state as Prisma.InputJsonObject } });
      }
      await this.finish(run.id, AutomationRunStatus.DONE, notes.join(' · ') || 'Concluída', state);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Automação ${run.rule.name} falhou: ${message}`);
      if (run.attempts >= MAX_ATTEMPTS) await this.finish(run.id, AutomationRunStatus.FAILED, `Falhou: ${message}`, state);
      else await this.prisma.automationRun.update({ where: { id: run.id }, data: { status: AutomationRunStatus.PENDING, runAt: new Date(Date.now() + RETRY_MINUTES * 60_000), result: `Tentativa ${run.attempts} falhou: ${message}`.slice(0, 500), state: state as Prisma.InputJsonObject } });
    }
  }

  private async siteUrl(storeId: string): Promise<string | null> {
    const domain = await this.prisma.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (domain) return `https://${domain.hostname}`;
    const fallback = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    return fallback ? fallback.replace(/\/$/, '') : null;
  }

  private async perform(action: Action, ctx: { storeId: string; ruleName: string; customer: { id: string; name: string; email: string; tags: string[]; marketingOptIn: boolean }; order: { number: string; total: Prisma.Decimal } | null; state: State }): Promise<string> {
    const { storeId, customer } = ctx;
    switch (action.type) {
      case 'ADD_TAG':
      case 'REMOVE_TAG': {
        const tag = normalizeTag(action.tag);
        const fresh = await this.prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { tags: true } });
        const tags = action.type === 'ADD_TAG' ? [...new Set([...fresh.tags, tag])].slice(0, 20) : fresh.tags.filter(t => t !== tag);
        await this.prisma.customer.update({ where: { id: customer.id }, data: { tags } });
        return action.type === 'ADD_TAG' ? `etiqueta “${tag}” adicionada` : `etiqueta “${tag}” removida`;
      }
      case 'ADD_POINTS': {
        await this.prisma.loyaltyEntry.create({ data: { storeId, customerId: customer.id, type: LoyaltyEntryType.ADJUST, points: action.points, note: `Automação: ${ctx.ruleName}`, actorId: 'automation' } });
        return `${action.points} pontos`;
      }
      case 'CREATE_COUPON': {
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = `${action.prefix}-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')}`;
          try {
            await this.prisma.coupon.create({ data: { storeId, code, description: `Gerado pela automação “${ctx.ruleName}” para ${customer.email}`, type: action.couponType === 'PERCENT' ? CouponType.PERCENT : CouponType.FIXED, value: action.value, minSubtotal: action.minSubtotal ?? null, maxUses: 1, oncePerCustomer: true, endsAt: new Date(Date.now() + action.validDays * 86_400_000), campaign: `Automação: ${ctx.ruleName}`.slice(0, 80) } });
            ctx.state.coupon = code;
            return `cupom ${code}`;
          } catch (error) {
            if ((error as { code?: string }).code !== 'P2002') throw error;
          }
        }
        throw new Error('Não foi possível gerar um código de cupom único');
      }
      case 'SEND_EMAIL': {
        const email = customer.email.trim().toLowerCase();
        const unsubscribed = await this.prisma.newsletterSubscriber.count({ where: { storeId, email: { equals: email, mode: 'insensitive' }, unsubscribedAt: { not: null } } });
        if (unsubscribed) return 'e-mail não enviado: cliente se descadastrou';
        if (action.requireOptIn && !customer.marketingOptIn) return 'e-mail não enviado: cliente não autorizou receber comunicações';
        const [store, site] = await Promise.all([this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }), this.siteUrl(storeId)]);
        if (!site) throw new Error('Endereço público da loja não configurado (PUBLIC_SITE_URL)');
        const vars = { nome: customer.name.trim().split(/\s+/)[0] || 'cliente', loja: store.name, pedido: ctx.order?.number ?? '', total: ctx.order ? `R$ ${Number(ctx.order.total).toFixed(2).replace('.', ',')}` : '', cupom: ctx.state.coupon ?? '', link_loja: site };
        const unsubscribeUrl = `${site}/descadastro/${makeUnsubscribeToken(storeId, email)}`;
        const rendered = renderCampaignMail({ subject: fillTemplate(action.subject, vars), body: fillTemplate(action.body, vars), storeName: store.name, recipientName: customer.name, unsubscribeUrl });
        let status: EmailStatus = EmailStatus.SENT; let providerId: string | undefined; let error: string | undefined;
        try {
          const result = await this.mail.send({ to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, from: process.env.MAIL_FROM ?? `${store.name} <novidades@example.com>`, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
          status = result.status; providerId = result.providerId;
        } catch (cause) { status = EmailStatus.FAILED; error = (cause as Error).message; }
        await this.prisma.emailLog.create({ data: { storeId, template: 'automation', toEmail: email, subject: rendered.subject, body: rendered.text, status, error, providerId } });
        if (status === EmailStatus.FAILED) throw new Error(`E-mail não enviado: ${error}`);
        return status === EmailStatus.SIMULATED ? 'e-mail simulado (provedor de e-mail não configurado)' : 'e-mail enviado';
      }
    }
  }
}
