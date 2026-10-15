import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { sanitizeStorefrontConfig, type StorefrontConfig } from './storefront-config';
import { READY_THEMES, buildThemeConfig, findReadyTheme } from './storefront-themes';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async get(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const publications = await this.prisma.storefrontPublication.findMany({
      where: { storeId }, orderBy: { version: 'desc' }, take: 20,
      select: { id: true, version: true, createdAt: true },
    });
    return {
      version: store.storefrontVersion,
      published: store.themeConfig,
      draft: store.draftThemeConfig,
      publishedAt: store.storefrontPublishedAt,
      publications,
    };
  }

  async save(storeId: string, version: number, input: unknown, publish: boolean, actorId: string) {
    const config = sanitizeStorefrontConfig(input) as Prisma.InputJsonObject;
    return this.prisma.$transaction(async tx => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
      const result = await tx.store.updateMany({
        where: { id: storeId, storefrontVersion: version },
        data: publish
          ? { themeConfig: config, draftThemeConfig: Prisma.DbNull, storefrontVersion: { increment: 1 }, storefrontPublishedAt: new Date() }
          : { draftThemeConfig: config, storefrontVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException('A vitrine foi alterada em outra sessão. Recarregue a página e revise suas alterações.');
      if (publish) {
        // Keep the pre-existing production theme, including stores created before this feature.
        if (!(await tx.storefrontPublication.count({ where: { storeId } }))) {
          await tx.storefrontPublication.create({ data: { storeId, version: 0, config: store.themeConfig as Prisma.InputJsonValue } });
        }
        await tx.storefrontPublication.create({ data: { storeId, version: version + 1, config, actorId } });
      }
      await tx.outboxEvent.create({ data: {
        storeId, aggregateType: 'Store', aggregateId: storeId,
        eventName: publish ? 'StorefrontPublished' : 'StorefrontDraftSaved',
        payload: { actorId, version: version + 1 },
      } });
      return { version: version + 1 };
    });
  }

  async restore(storeId: string, version: number, publicationId: string, actorId: string) {
    const publication = await this.prisma.storefrontPublication.findFirst({ where: { id: publicationId, storeId } });
    if (!publication) throw new NotFoundException('Publicação não encontrada nesta loja.');
    return this.save(storeId, version, publication.config, false, actorId);
  }

  async getPublication(storeId: string, id: string) {
    const publication = await this.prisma.storefrontPublication.findFirst({ where: { id, storeId }, select: { id: true, version: true, config: true, createdAt: true } });
    if (!publication) throw new NotFoundException('Publicação não encontrada nesta loja.');
    return publication;
  }

  listThemes() {
    return READY_THEMES.map(theme => ({
      key: theme.key, name: theme.name, tagline: theme.tagline, segments: theme.segments,
      accentColor: theme.config.accentColor, backgroundColor: theme.config.design?.backgroundColor ?? '#FFFFFF', textColor: theme.config.design?.textColor ?? '#111827',
      font: theme.config.design?.font ?? 'sans', buttonRadius: theme.config.design?.buttonRadius ?? 'md',
      cardStyle: theme.config.design?.cardStyle ?? 'soft', headingFont: theme.config.design?.headingFont ?? 'same', heroTone: theme.config.design?.heroTone ?? 'dark', mode: theme.config.design?.mode ?? 'light',
      heroLayout: String(theme.config.home?.sections.find(section => section.type === 'hero')?.props.layout ?? 'split'),
      sections: theme.config.home?.sections.map(section => section.type) ?? [],
    }));
  }

  /** Grava o tema escolhido no rascunho (nunca publica) e mantém logo/favicon da loja. */
  async applyTheme(storeId: string, key: string, actorId: string) {
    const theme = findReadyTheme(key);
    if (!theme) throw new NotFoundException('Tema não encontrado.');
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const current = (store.draftThemeConfig ?? store.themeConfig ?? null) as StorefrontConfig | null;
    const config = buildThemeConfig(theme, store.name, current);
    return this.save(storeId, store.storefrontVersion, config, false, actorId);
  }

  async legacyPublish(storeId: string, input: unknown, actorId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const current = store.themeConfig;
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new BadRequestException('Configuração inválida.');
    return this.save(storeId, store.storefrontVersion, { ...current, ...sanitizeStorefrontConfig(input) }, true, actorId);
  }
}
