import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { toCsv } from '../inventory/stock-ledger';
import { bannerIsLive, isSafeBannerLink, isValidEmail, normalizeEmail, normalizeWhatsapp } from './engagement-rules';

export type BannerInput = {
  imageUrl?: string; mobileImageUrl?: string | null; title?: string | null; subtitle?: string | null; ctaLabel?: string | null; linkUrl?: string | null;
  position?: number; active?: boolean; startsAt?: string | null; endsAt?: string | null;
};

const httpsOnly = (value: string | null | undefined, label: string) => {
  if (!value) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException(`${label} inválida`); }
  if (url.protocol !== 'https:') throw new BadRequestException(`${label} precisa usar HTTPS`);
  return url.toString();
};

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  private async storeId(slug: string) {
    return (await this.prisma.store.findUnique({ where: { slug }, select: { id: true } }))?.id;
  }

  // Banners ---------------------------------------------------------------------------------------------------------

  async publicBanners(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    const rows = await this.prisma.banner.findMany({ where: { storeId, active: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const now = new Date();
    return rows.filter(b => bannerIsLive(b, now)).map(({ id, imageUrl, mobileImageUrl, title, subtitle, ctaLabel, linkUrl }) => ({ id, imageUrl, mobileImageUrl, title, subtitle, ctaLabel, linkUrl }));
  }

  adminBanners(storeId: string) {
    return this.prisma.banner.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  private bannerData(input: BannerInput): Prisma.BannerUncheckedUpdateInput {
    const data: Prisma.BannerUncheckedUpdateInput = {};
    if (input.imageUrl !== undefined) data.imageUrl = httpsOnly(input.imageUrl, 'Imagem') as string;
    if (input.mobileImageUrl !== undefined) data.mobileImageUrl = httpsOnly(input.mobileImageUrl || null, 'Imagem para celular') ?? null;
    for (const key of ['title', 'subtitle', 'ctaLabel'] as const) if (input[key] !== undefined) data[key] = input[key]?.trim() || null;
    if (input.linkUrl !== undefined) {
      const link = input.linkUrl?.trim() || null;
      if (link && !isSafeBannerLink(link)) throw new BadRequestException('O link do banner deve começar com / ou https://');
      data.linkUrl = link;
    }
    if (input.position !== undefined) data.position = input.position;
    if (input.active !== undefined) data.active = input.active;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    const { startsAt, endsAt } = data as { startsAt?: Date | null; endsAt?: Date | null };
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('O fim do banner precisa ser depois do começo');
    return data;
  }

  async createBanner(storeId: string, input: BannerInput & { imageUrl: string }) {
    const data = this.bannerData(input) as Prisma.BannerUncheckedCreateInput;
    if (input.position === undefined) data.position = ((await this.prisma.banner.aggregate({ where: { storeId }, _max: { position: true } }))._max.position ?? -1) + 1;
    return this.prisma.banner.create({ data: { ...data, storeId, imageUrl: data.imageUrl } });
  }

  /** Vários slides de uma vez (envio de várias imagens): cada imagem vira um banner, na ordem recebida, no fim do carrossel. */
  async createBanners(storeId: string, images: string[]) {
    const created = [];
    for (const imageUrl of images) created.push(await this.createBanner(storeId, { imageUrl }));
    return created;
  }

  async updateBanner(storeId: string, id: string, input: BannerInput) {
    if (!(await this.prisma.banner.findFirst({ where: { id, storeId } }))) throw new NotFoundException('Banner não encontrado');
    return this.prisma.banner.update({ where: { id }, data: this.bannerData(input) });
  }

  async deleteBanner(storeId: string, id: string) {
    const { count } = await this.prisma.banner.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Banner não encontrado');
  }

  // WhatsApp --------------------------------------------------------------------------------------------------------

  async saveWhatsapp(storeId: string, number: string | null, message: string | null) {
    const normalized = number ? normalizeWhatsapp(number) : null;
    if (number && !normalized) throw new BadRequestException('Informe o WhatsApp com DDD, por exemplo (21) 99999-8888');
    const store = await this.prisma.store.update({ where: { id: storeId }, data: { whatsappNumber: normalized, whatsappMessage: normalized ? message?.trim() || null : null }, select: { whatsappNumber: true, whatsappMessage: true } });
    return store;
  }

  async whatsapp(storeId: string) {
    return this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { whatsappNumber: true, whatsappMessage: true } });
  }

  // Newsletter ------------------------------------------------------------------------------------------------------

  /** Idempotente e sem revelar se o e-mail já estava na lista; quem tinha saído e volta a se inscrever é reativado. */
  async subscribe(storeSlug: string, rawEmail: string, name?: string, source = 'site') {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) throw new BadRequestException('Informe um e-mail válido');
    const storeId = await this.storeId(storeSlug);
    if (!storeId) throw new NotFoundException('Loja não encontrada');
    const cleanName = name?.trim().slice(0, 80) || undefined;
    await this.prisma.newsletterSubscriber.upsert({
      where: { storeId_email: { storeId, email } },
      create: { storeId, email, name: cleanName, source },
      update: { unsubscribedAt: null, ...(cleanName && { name: cleanName }) },
    });
    return { subscribed: true };
  }

  async subscribers(storeId: string, { page = 1, pageSize = 50 }: { page?: number; pageSize?: number }) {
    const where = { storeId, unsubscribedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async unsubscribe(storeId: string, id: string) {
    const { count } = await this.prisma.newsletterSubscriber.updateMany({ where: { id, storeId, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    if (!count) throw new NotFoundException('Inscrito não encontrado');
  }

  async exportSubscribers(storeId: string) {
    const rows = await this.prisma.newsletterSubscriber.findMany({ where: { storeId, unsubscribedAt: null }, orderBy: { createdAt: 'asc' }, take: 50_000 });
    return toCsv([['E-mail', 'Nome', 'Origem', 'Inscrito em'], ...rows.map(r => [r.email, r.name ?? '', r.source, r.createdAt.toISOString()])]);
  }
}
