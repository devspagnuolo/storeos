import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { AccountService } from '../account/account.service';
import { isValidCpf, onlyDigits } from '../payments/payment-rules';
import { DRAFT_TTL_DAYS, DraftData, maskEmail, sameEmail, sanitizeDraft } from './checkout-draft-rules';

export type IdentifyResult =
  | { status: 'draft'; data: DraftData }
  | { status: 'known'; maskedEmail: string }
  | { status: 'new' };

/**
 * Rascunho do checkout e identificação pelo CPF. O token é um segredo guardado só no navegador do cliente:
 * com ele, o próprio aparelho recupera tudo. Em outro aparelho, o CPF sozinho não revela dados: é preciso
 * informar o e-mail do cadastro e o código que chega nele (CPF e e-mail de alguém não bastam para ver o endereço).
 */
@Injectable()
export class CheckoutDraftService {
  constructor(private readonly prisma: PrismaService, private readonly account: AccountService) {}

  private async storeId(slug: string) {
    return (await this.prisma.store.findUnique({ where: { slug }, select: { id: true } }))?.id;
  }

  /** Grava (ou atualiza) os campos digitados. Chamado a cada alteração no checkout. */
  async save(input: { storeSlug: string; token: string; cpf?: string; data: unknown }) {
    const storeId = await this.storeId(input.storeSlug);
    if (!storeId) return { saved: false };
    const cpf = onlyDigits(input.cpf ?? '');
    const data = sanitizeDraft(input.data) as Prisma.InputJsonObject;
    const existing = await this.prisma.checkoutDraft.findUnique({ where: { token: input.token } });
    // O token pertence a uma loja só; um token de outra loja é ignorado em vez de sobrescrito.
    if (existing && existing.storeId !== storeId) return { saved: false };
    await this.prisma.checkoutDraft.upsert({
      where: { token: input.token },
      create: { storeId, token: input.token, cpf: isValidCpf(cpf) ? cpf : null, data },
      update: { data, ...(isValidCpf(cpf) && { cpf }) },
    });
    return { saved: true };
  }

  /** Primeiro passo do checkout: o CPF diz se há rascunho neste aparelho, cadastro na loja, ou se é um cliente novo. */
  async identify(input: { storeSlug: string; token: string; cpf: string }): Promise<IdentifyResult> {
    const storeId = await this.storeId(input.storeSlug);
    const cpf = onlyDigits(input.cpf);
    if (!storeId || !isValidCpf(cpf)) return { status: 'new' };
    const own = await this.prisma.checkoutDraft.findUnique({ where: { token: input.token } });
    if (own && own.storeId === storeId && (!own.cpf || own.cpf === cpf)) {
      if (!own.cpf) await this.prisma.checkoutDraft.update({ where: { id: own.id }, data: { cpf } });
      return { status: 'draft', data: own.data as DraftData };
    }
    const email = await this.knownEmail(storeId, cpf);
    return email ? { status: 'known', maskedEmail: maskEmail(email) } : { status: 'new' };
  }

  /**
   * Cliente de outro aparelho confirma o e-mail do cadastro: sem `code`, o código vai para esse e-mail;
   * com o código certo, recebe os dados para não digitar de novo.
   */
  async confirm(input: { storeSlug: string; token: string; cpf: string; email: string; code?: string }): Promise<{ matched: boolean; codeSent?: boolean; data?: DraftData }> {
    const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug }, select: { id: true, name: true } });
    const storeId = store?.id;
    const cpf = onlyDigits(input.cpf);
    if (!store || !storeId || !isValidCpf(cpf)) return { matched: false };
    const [customer, draft] = await Promise.all([
      this.prisma.customer.findFirst({ where: { storeId, document: cpf, anonymizedAt: null }, orderBy: { updatedAt: 'desc' }, include: { orders: { orderBy: { createdAt: 'desc' }, take: 1, select: { shippingAddress: true } } } }),
      this.prisma.checkoutDraft.findFirst({ where: { storeId, cpf }, orderBy: { updatedAt: 'desc' } }),
    ]);
    const draftData = (draft?.data ?? {}) as DraftData;
    const matchesCustomer = sameEmail(customer?.email, input.email);
    const matchesDraft = sameEmail(draftData.email, input.email);
    if (!matchesCustomer && !matchesDraft) return { matched: false };
    if (!input.code) {
      // Pedido repetido dentro da janela não manda outro e-mail; o código anterior continua valendo.
      await this.account.sendCode(store, input.email, (matchesCustomer ? customer?.name : draftData.name) ?? '', 'checkout');
      return { matched: true, codeSent: true };
    }
    if (!(await this.account.consumeCode(storeId, input.email, input.code))) throw new BadRequestException('Código inválido ou expirado. Peça um novo código.');
    const address = (matchesCustomer ? customer?.orders[0]?.shippingAddress : undefined) as Record<string, unknown> | undefined;
    // O rascunho mais recente vale mais que o último pedido: é o que o cliente estava digitando.
    const data = sanitizeDraft({ ...(matchesCustomer && { name: customer!.name, email: customer!.email, phone: customer!.phone ?? undefined }), ...address, ...(matchesDraft ? draftData : {}) });
    await this.save({ storeSlug: input.storeSlug, token: input.token, cpf, data });
    return { matched: true, data };
  }

  /** Pedido fechado: o rascunho deixa de ser necessário. */
  async finish(storeId: string, cpf: string) {
    await this.prisma.checkoutDraft.deleteMany({ where: { storeId, cpf } });
  }

  async purgeStale(now = new Date()) {
    const { count } = await this.prisma.checkoutDraft.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - DRAFT_TTL_DAYS * 86_400_000) } } });
    return count;
  }

  private async knownEmail(storeId: string, cpf: string) {
    const customer = await this.prisma.customer.findFirst({ where: { storeId, document: cpf, anonymizedAt: null }, orderBy: { updatedAt: 'desc' }, select: { email: true } });
    if (customer) return customer.email;
    const draft = await this.prisma.checkoutDraft.findFirst({ where: { storeId, cpf }, orderBy: { updatedAt: 'desc' } });
    return (draft?.data as DraftData | undefined)?.email;
  }
}
