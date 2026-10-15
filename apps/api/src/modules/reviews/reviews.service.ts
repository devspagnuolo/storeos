import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { displayName, isReviewableOrder, parseReview, summarize } from './review-rules';

const PAGE = 10;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Avaliações aprovadas de um produto, com média e distribuição, para a página do produto. */
  async publicList(storeSlug: string, productSlug: string, page = 1) {
    const product = await this.prisma.product.findFirst({ where: { slug: productSlug, status: 'ACTIVE', store: { slug: storeSlug } }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const where = { productId: product.id, status: ReviewStatus.APPROVED };
    const [ratings, items] = await Promise.all([
      this.prisma.productReview.findMany({ where, select: { rating: true } }),
      this.prisma.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(page, 1) - 1) * PAGE, take: PAGE, select: { id: true, authorName: true, rating: true, title: true, body: true, reply: true, repliedAt: true, createdAt: true } }),
    ]);
    return { summary: summarize(ratings.map(r => r.rating)), items: items.map(({ authorName, ...rest }) => ({ ...rest, author: authorName, verified: true })), page, pageSize: PAGE };
  }

  /** Quem comprou o produto (número do pedido + e-mail) envia a avaliação; ela fica pendente até o lojista aprovar. */
  async submit(input: { storeSlug: string; productSlug: string; orderNumber: string; email: string; rating: number; title?: string; body: string }) {
    const parsed = parseReview(input);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    const notFound = new NotFoundException('Não encontramos esse pedido com esse e-mail. Confira o número e o e-mail da compra.');
    const order = await this.prisma.order.findFirst({
      where: { store: { slug: input.storeSlug }, number: input.orderNumber.trim(), customer: { is: { email: { equals: input.email.trim(), mode: 'insensitive' } } } },
      select: { id: true, storeId: true, status: true, customerId: true, customer: { select: { name: true } }, items: { select: { productId: true, product: { select: { slug: true } } } } },
    });
    if (!order) throw notFound;
    if (!isReviewableOrder(order.status)) throw new BadRequestException('Este pedido ainda não foi pago ou foi encerrado, então não pode ser avaliado.');
    const item = order.items.find(i => i.product?.slug === input.productSlug && i.productId);
    if (!item?.productId) throw new BadRequestException('Este produto não faz parte desse pedido.');
    try {
      await this.prisma.productReview.create({
        data: { storeId: order.storeId, productId: item.productId, orderId: order.id, customerId: order.customerId, authorName: displayName(order.customer?.name ?? ''), rating: parsed.rating, title: parsed.title, body: parsed.body },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Você já avaliou este produto neste pedido.');
      throw error;
    }
    return { status: 'PENDING', message: 'Obrigada! Sua avaliação foi enviada e aparece na loja depois de aprovada.' };
  }

  async list(storeId: string, filter: { status?: ReviewStatus; page?: number }) {
    const where: Prisma.ProductReviewWhereInput = { storeId, ...(filter.status && { status: filter.status }) };
    const page = Math.max(filter.page ?? 1, 1);
    const [items, total, counts] = await Promise.all([
      this.prisma.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { product: { select: { id: true, name: true, slug: true } } } }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    const byStatus = Object.fromEntries(counts.map(c => [c.status, c._count._all]));
    return { items, total, page, pageSize: 25, counts: { PENDING: byStatus.PENDING ?? 0, APPROVED: byStatus.APPROVED ?? 0, REJECTED: byStatus.REJECTED ?? 0 } };
  }

  async moderate(storeId: string, id: string, patch: { status?: ReviewStatus; reply?: string | null }) {
    const current = await this.prisma.productReview.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundException('Avaliação não encontrada');
    const data: Prisma.ProductReviewUpdateInput = {};
    if (patch.status) data.status = patch.status;
    if (patch.reply !== undefined) {
      const reply = patch.reply?.replace(/\s+/g, ' ').trim() ?? '';
      data.reply = reply || null;
      data.repliedAt = reply ? new Date() : null;
    }
    return this.prisma.productReview.update({ where: { id }, data });
  }

  async remove(storeId: string, id: string) {
    const { count } = await this.prisma.productReview.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Avaliação não encontrada');
  }
}
