import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { FidelizeiRedemptionStatus, PaymentMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveJwtSecret } from '../../shared/auth/jwt-secret';
import { decryptSecret, encryptSecret } from '../../shared/auth/totp';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { isValidCpf, onlyDigits } from '../payments/payment-rules';
import { FidelizeiApiError, FidelizeiClient } from './fidelizei.client';
import { idempotencyKey, isFidelizeiKey, keyHint, RewardDiscount, rewardDiscount } from './fidelizei-rules';

const secret = () => process.env.INTEGRATIONS_KEY ?? resolveJwtSecret();

type Reward = { id: string; name: string; description?: string | null; pointsCost: number; discountType: string; discountValue: number; minimumOrderCents?: number | null; validUntil?: string | null; canRedeem: boolean };
type LoyaltyResponse = { data: { customer: { pointsBalance: number; enrolledAt: string }; tierRank: number; rewards: Reward[] } };
type ReserveResponse = { data: { id: string; code: string; pointsDebited: number; reservationExpiresAt: string; discount: RewardDiscount } };
type ValidateResponse = { data: { redemptionId: string; status: string; discount: RewardDiscount } };

export type SettingsInput = { apiKey?: string; enabled?: boolean; termsVersion?: string; privacyVersion?: string; termsUrl?: string | null; privacyUrl?: string | null };
export type CheckoutReward = { checkoutId: string; code: string };

/** Formas de pagamento que aceitam benefício: a reserva do Fidelizei vale 20 minutos e o boleto pode levar dias. */
export const REWARD_PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.PIX, PaymentMethod.CREDIT_CARD];

/**
 * Integração com o Fidelizei (programa de fidelidade). O Fidelizei manda no saldo e nas regras;
 * a loja só faz a adesão, mostra os benefícios e aplica o desconto que a API validar.
 */
@Injectable()
export class FidelizeiService {
  private readonly logger = new Logger(FidelizeiService.name);

  constructor(private readonly prisma: PrismaService, private readonly client: FidelizeiClient) {}

  // ---------- painel ----------

  async settings(storeId: string) {
    const c = await this.prisma.fidelizeiConnection.findUnique({ where: { storeId } });
    const [members, redemptions] = await Promise.all([this.prisma.fidelizeiMember.count({ where: { storeId } }), this.prisma.fidelizeiRedemption.groupBy({ by: ['status'], where: { storeId }, _count: true })]);
    return {
      connected: Boolean(c), keyHint: c?.keyHint ?? null, enabled: c?.enabled ?? false,
      termsVersion: c?.termsVersion ?? '2026-10', privacyVersion: c?.privacyVersion ?? '2026-10', termsUrl: c?.termsUrl ?? null, privacyUrl: c?.privacyUrl ?? null,
      lastError: c?.lastError ?? null, checkedAt: c?.checkedAt ?? null, members,
      redemptions: Object.fromEntries(redemptions.map(row => [row.status, row._count])),
    };
  }

  async saveSettings(storeId: string, input: SettingsInput) {
    const current = await this.prisma.fidelizeiConnection.findUnique({ where: { storeId } });
    const apiKey = input.apiKey?.trim();
    if (apiKey !== undefined && apiKey !== '' && !isFidelizeiKey(apiKey)) throw new BadRequestException('Chave inválida: copie a chave inteira gerada no Fidelizei (começa com fz_).');
    if (!current && !apiKey) throw new BadRequestException('Cole a chave da API gerada no Fidelizei.');
    const url = (value: string | null | undefined) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim();
      if (!trimmed) return null;
      if (!/^https:\/\/\S{3,300}$/.test(trimmed)) throw new BadRequestException('Os links dos termos e da política precisam começar com https://');
      return trimmed;
    };
    const version = (value?: string) => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      if (!/^[\w.-]{1,40}$/.test(trimmed)) throw new BadRequestException('Versão dos documentos: use letras, números, ponto ou traço (ex.: 2026-10).');
      return trimmed;
    };
    const data = {
      ...(apiKey && { apiKeyEnc: encryptSecret(apiKey, secret()), keyHint: keyHint(apiKey), lastError: null, checkedAt: null }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(version(input.termsVersion) && { termsVersion: version(input.termsVersion) }),
      ...(version(input.privacyVersion) && { privacyVersion: version(input.privacyVersion) }),
      ...(url(input.termsUrl) !== undefined && { termsUrl: url(input.termsUrl) }),
      ...(url(input.privacyUrl) !== undefined && { privacyUrl: url(input.privacyUrl) }),
    };
    if (current) await this.prisma.fidelizeiConnection.update({ where: { storeId }, data });
    else await this.prisma.fidelizeiConnection.create({ data: { storeId, apiKeyEnc: data.apiKeyEnc!, keyHint: data.keyHint!, ...data } });
    if (apiKey) await this.test(storeId);
    return this.settings(storeId);
  }

  /** Confere a chave lendo a fila de eventos (só leitura). */
  async test(storeId: string) {
    const { apiKey } = await this.connectionOrFail(storeId, true);
    try {
      await this.client.request(apiKey, '/storeos/events?after=0&limit=1');
      await this.prisma.fidelizeiConnection.update({ where: { storeId }, data: { lastError: null, checkedAt: new Date() } });
      return { ok: true };
    } catch (error) {
      const message = this.adminMessage(error);
      await this.prisma.fidelizeiConnection.update({ where: { storeId }, data: { lastError: message, checkedAt: new Date() } });
      return { ok: false, error: message };
    }
  }

  async disconnect(storeId: string) {
    await this.prisma.fidelizeiConnection.deleteMany({ where: { storeId } });
  }

  async redemptions(storeId: string) {
    const rows = await this.prisma.fidelizeiRedemption.findMany({ where: { storeId, orderId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { number: true, status: true } }, customer: { select: { name: true } } } });
    return rows.map(row => ({ id: row.id, orderNumber: row.order?.number ?? null, orderStatus: row.order?.status ?? null, customer: row.customer.name, reward: row.rewardName, code: row.code, points: row.pointsDebited, discount: row.discountAmount?.toFixed(2) ?? null, status: row.status, lastError: row.lastError, createdAt: row.createdAt }));
  }

  private adminMessage(error: unknown) {
    if (!(error instanceof FidelizeiApiError)) return (error as Error).message.slice(0, 300);
    if (error.status === 401) return 'O Fidelizei recusou a chave (inválida, expirada ou revogada). Gere outra em Integrações → Chaves da API.';
    if (error.status === 403) return `O Fidelizei não liberou esta operação: ${error.message}`.slice(0, 300);
    return error.message.slice(0, 300);
  }

  async connectionOrFail(storeId: string, includeDisabled = false) {
    const connection = await this.prisma.fidelizeiConnection.findUnique({ where: { storeId } });
    if (!connection || (!includeDisabled && !connection.enabled)) throw new NotFoundException('Programa de fidelidade não disponível nesta loja.');
    return { connection, apiKey: decryptSecret(connection.apiKeyEnc, secret()) };
  }

  /** Erro do Fidelizei para quem está comprando: regras de negócio viram mensagem; falhas técnicas, aviso genérico. */
  private customerError(error: unknown, storeId: string): never {
    if (error instanceof FidelizeiApiError && [400, 404, 409, 422].includes(error.status)) throw new BadRequestException({ message: error.message, code: error.code ?? 'FIDELIZEI' });
    if (error instanceof FidelizeiApiError && [401, 403].includes(error.status)) {
      void this.prisma.fidelizeiConnection.updateMany({ where: { storeId }, data: { lastError: this.adminMessage(error) } }).catch(() => undefined);
    }
    this.logger.warn(`Fidelizei indisponível: ${(error as Error).message.slice(0, 200)}`);
    throw new ServiceUnavailableException('O programa de fidelidade está indisponível agora. Tente de novo em instantes.');
  }

  // ---------- área do cliente ----------

  async loyalty(storeId: string, customerId: string) {
    const connection = await this.prisma.fidelizeiConnection.findUnique({ where: { storeId } });
    if (!connection?.enabled) return { enabled: false as const };
    const [member, customer] = await Promise.all([
      this.prisma.fidelizeiMember.findUnique({ where: { customerId } }),
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { document: true } }),
    ]);
    const base = { enabled: true as const, termsUrl: connection.termsUrl, privacyUrl: connection.privacyUrl, hasDocument: onlyDigits(customer.document ?? '').length === 11 };
    if (!member) return { ...base, enrolled: false as const };
    const { apiKey } = await this.connectionOrFail(storeId);
    try {
      const { data } = await this.client.request<LoyaltyResponse>(apiKey, `/storeos/customers/${encodeURIComponent(customerId)}/loyalty`);
      return {
        ...base, enrolled: true as const, available: true, balance: data.customer.pointsBalance, enrolledAt: data.customer.enrolledAt,
        rewards: data.rewards.map(r => ({ id: r.id, name: r.name, description: r.description ?? null, pointsCost: r.pointsCost, discountType: r.discountType, discountValue: r.discountValue, minimumOrderCents: r.minimumOrderCents ?? 0, validUntil: r.validUntil ?? null, canRedeem: r.canRedeem })),
      };
    } catch (error) {
      // Adesão desfeita no Fidelizei: volta a oferecer a adesão.
      if (error instanceof FidelizeiApiError && error.status === 404) {
        await this.prisma.fidelizeiMember.deleteMany({ where: { customerId } });
        return { ...base, enrolled: false as const };
      }
      this.logger.warn(`Saldo do Fidelizei indisponível: ${(error as Error).message.slice(0, 200)}`);
      return { ...base, enrolled: true as const, available: false, balance: null, rewards: [] };
    }
  }

  /** Público: o cadastro do site só oferece a adesão quando a loja tem o programa ligado. */
  async program(storeSlug: string) {
    const connection = await this.prisma.fidelizeiConnection.findFirst({ where: { store: { slug: storeSlug } }, select: { enabled: true, termsUrl: true, privacyUrl: true } });
    return connection?.enabled ? { enabled: true, termsUrl: connection.termsUrl, privacyUrl: connection.privacyUrl } : { enabled: false };
  }

  async enroll(storeId: string, customerId: string, input: { cpf?: string; phone?: string; consent?: boolean }) {
    if (input.consent !== true) throw new BadRequestException('Para participar, marque que aceita os termos do programa e a política de privacidade.');
    const { connection, apiKey } = await this.connectionOrFail(storeId);
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { name: true, email: true, phone: true, document: true } });
    const cpf = onlyDigits(input.cpf ?? customer.document ?? '');
    if (!isValidCpf(cpf)) throw new BadRequestException('Informe um CPF válido. É ele que identifica você no programa de pontos.');
    const typedPhone = onlyDigits(input.phone ?? '');
    const phone = customer.phone || (typedPhone.length >= 10 && typedPhone.length <= 13 ? typedPhone : null);
    const body = { externalCustomerId: customerId, name: customer.name, cpf, email: customer.email, ...(phone && { phone }), programConsent: true, termsVersion: connection.termsVersion, privacyVersion: connection.privacyVersion };
    let data: { id: string; enrolledAt: string; pointsBalance: number };
    try {
      ({ data } = await this.client.request<{ data: typeof data }>(apiKey, '/storeos/customers/enroll', { method: 'POST', body, idempotencyKey: idempotencyKey(`enroll-${customerId}`, body) }));
    } catch (error) {
      this.customerError(error, storeId);
    }
    await this.prisma.fidelizeiMember.upsert({
      where: { customerId },
      create: { storeId, customerId, fidelizeiCustomerId: data.id, enrolledAt: new Date(data.enrolledAt ?? Date.now()) },
      update: { fidelizeiCustomerId: data.id, enrolledAt: new Date(data.enrolledAt ?? Date.now()) },
    });
    // O mesmo CPF vai no pedido e no contato do Bling: é por ele que o Fidelizei credita os pontos.
    if (!customer.document || (!customer.phone && phone)) await this.prisma.customer.update({ where: { id: customerId }, data: { ...(!customer.document && { document: cpf }), ...(!customer.phone && phone && { phone }) } });
    return this.loyalty(storeId, customerId);
  }

  /** Reserva um benefício para usar no próximo pedido. Uma reserva aberta anterior é devolvida antes. */
  async reserve(storeId: string, customerId: string, input: { rewardId?: string; subtotal?: number }) {
    const rewardId = input.rewardId?.trim();
    if (!rewardId || rewardId.length > 120) throw new BadRequestException('Escolha um benefício.');
    const subtotalCents = Math.round(Number(input.subtotal) * 100);
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new BadRequestException('Subtotal inválido.');
    if (!(await this.prisma.fidelizeiMember.findUnique({ where: { customerId } }))) throw new BadRequestException('Participe do programa de fidelidade na sua conta antes de usar pontos.');
    const { apiKey } = await this.connectionOrFail(storeId);
    const open = await this.prisma.fidelizeiRedemption.findMany({ where: { customerId, status: FidelizeiRedemptionStatus.RESERVED, orderId: null } });
    for (const previous of open) await this.release(storeId, customerId, previous.checkoutId).catch(() => undefined);

    const checkoutId = `storeos-${randomUUID()}`;
    const body = { externalCustomerId: customerId, rewardId, checkoutId, subtotalCents };
    let data: ReserveResponse['data'];
    try {
      ({ data } = await this.client.request<ReserveResponse>(apiKey, '/storeos/redemptions', { method: 'POST', body, idempotencyKey: idempotencyKey(`reserve-${checkoutId}`, body) }));
    } catch (error) {
      this.customerError(error, storeId);
    }
    const loyalty = await this.client.request<LoyaltyResponse>(apiKey, `/storeos/customers/${encodeURIComponent(customerId)}/loyalty`).catch(() => null);
    const rewardName = loyalty?.data.rewards.find(r => r.id === rewardId)?.name ?? 'Benefício Fidelizei';
    await this.prisma.fidelizeiRedemption.create({
      data: {
        storeId, customerId, redemptionId: data.id, checkoutId, code: data.code.toUpperCase(), rewardId, rewardName, pointsDebited: data.pointsDebited,
        discountType: data.discount.type, discountValue: data.discount.value, minimumOrderCents: data.discount.minimumOrderCents ?? 0, reservationExpiresAt: new Date(data.reservationExpiresAt),
      },
    });
    return { checkoutId, code: data.code.toUpperCase(), rewardName, pointsDebited: data.pointsDebited, discount: data.discount, reservationExpiresAt: data.reservationExpiresAt, balance: loyalty?.data.customer.pointsBalance ?? null };
  }

  /** Desiste do benefício antes de fechar o pedido: os pontos voltam na hora. */
  async release(storeId: string, customerId: string, checkoutId: string) {
    const row = await this.prisma.fidelizeiRedemption.findUnique({ where: { checkoutId } });
    if (!row || row.customerId !== customerId || row.storeId !== storeId) throw new NotFoundException('Benefício não encontrado.');
    if (row.orderId) throw new ConflictException('Este benefício já está em um pedido.');
    if (row.status !== FidelizeiRedemptionStatus.RESERVED) return { released: true };
    await this.cancelRemote(row, { checkoutId: row.checkoutId, reason: 'checkout_failed' });
    await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { status: FidelizeiRedemptionStatus.CANCELLED, cancelledAt: new Date(), lastError: null } });
    return { released: true };
  }

  async cancelRemote(row: { storeId: string; redemptionId: string }, body: { checkoutId?: string; storeosOrderId?: string; blingOrderId?: string; reason: string }) {
    const { apiKey } = await this.connectionOrFail(row.storeId, true);
    return this.client.request<{ data: { status: string } }>(apiKey, `/storeos/redemptions/${encodeURIComponent(row.redemptionId)}/cancel`, { method: 'POST', body, idempotencyKey: idempotencyKey(`cancel-${row.redemptionId}`, body) });
  }

  // ---------- checkout ----------

  /**
   * Confere o benefício antes de criar o pedido: precisa estar reservado para esta cliente, ainda no prazo,
   * e a API do Fidelizei tem que validá-lo para o subtotal. Devolve a regra de desconto validada.
   */
  async validateForCheckout(storeId: string, input: { reward: CheckoutReward; email: string; subtotal: Prisma.Decimal; paymentMethod: PaymentMethod; couponCode?: string }) {
    if (input.couponCode?.trim()) throw new BadRequestException('Use o cupom ou o benefício de pontos, um de cada vez.');
    if (!REWARD_PAYMENT_METHODS.includes(input.paymentMethod)) throw new BadRequestException('O benefício de pontos vale para pagamento com Pix ou cartão.');
    const row = await this.prisma.fidelizeiRedemption.findUnique({ where: { checkoutId: input.reward.checkoutId }, include: { customer: { select: { email: true } } } });
    const expired = new BadRequestException({ message: 'O benefício de pontos expirou. Escolha de novo para continuar.', code: 'FIDELIZEI_EXPIRED' });
    if (!row || row.storeId !== storeId || row.code !== input.reward.code.trim().toUpperCase()) throw expired;
    if (row.orderId || row.status !== FidelizeiRedemptionStatus.RESERVED || row.reservationExpiresAt.getTime() <= Date.now()) throw expired;
    if (row.customer.email !== input.email) throw new BadRequestException('O benefício de pontos é da conta que o escolheu. Use o mesmo e-mail da sua conta.');
    const { apiKey } = await this.connectionOrFail(storeId);
    try {
      const { data } = await this.client.request<ValidateResponse>(apiKey, '/storeos/coupons/validate', { method: 'POST', body: { code: row.code, externalCustomerId: row.customerId, checkoutId: row.checkoutId, subtotalCents: Math.round(Number(input.subtotal) * 100) } });
      if (data.status !== 'valid') throw expired;
      return { row, discount: data.discount };
    } catch (error) {
      if (error === expired) throw error;
      this.customerError(error, storeId);
    }
  }

  /** Dentro da transação do checkout: liga o benefício ao pedido (uma única vez) e devolve o valor do desconto. */
  async attachToOrder(tx: Prisma.TransactionClient, rowId: string, orderId: string, amount: Prisma.Decimal) {
    const attached = await tx.fidelizeiRedemption.updateMany({ where: { id: rowId, orderId: null, status: FidelizeiRedemptionStatus.RESERVED }, data: { orderId, discountAmount: amount } });
    if (attached.count !== 1) throw new ConflictException('Este benefício de pontos já foi usado em outro pedido.');
  }

  /**
   * Logo depois de criar o pedido: liga a reserva ao pedido no Fidelizei. A reserva deixa de vencer em 20 minutos
   * e fica guardada por até 48 horas, esperando o pedido chegar ao Bling para confirmar o uso.
   */
  async linkOrder(rowId: string) {
    const row = await this.prisma.fidelizeiRedemption.findUnique({ where: { id: rowId } });
    if (!row?.orderId || row.orderLinkedAt || row.status !== FidelizeiRedemptionStatus.RESERVED) return row?.orderLinkedAt ?? null;
    const { apiKey } = await this.connectionOrFail(row.storeId, true);
    const body = { checkoutId: row.checkoutId, storeosOrderId: row.orderId };
    const { data } = await this.client.request<{ data: { pendingUntil?: string } }>(apiKey, `/storeos/redemptions/${encodeURIComponent(row.redemptionId)}/link-order`, { method: 'POST', body, idempotencyKey: idempotencyKey(`link-${row.redemptionId}`, body) });
    const linkedAt = new Date();
    await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { orderLinkedAt: linkedAt, ...(data.pendingUntil && { reservationExpiresAt: new Date(data.pendingUntil) }) } });
    return linkedAt;
  }

  discountFor(discount: RewardDiscount, base: Prisma.Decimal) {
    return rewardDiscount(discount, base);
  }
}
