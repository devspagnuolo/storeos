import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { readMarketingConfig } from '../seo/seo-rules';
import { StoreAssetsService } from './store-assets.service';
import { StorefrontService } from './storefront.service';

class UpdateStoreDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) @IsUrl({ protocols: ['https'], require_protocol: true }) logoUrl?: string | null;
  @IsOptional() @IsObject() themeConfig?: Record<string, unknown>;
}

const view = (store: { id: string; slug: string; name: string; logoUrl: string | null; faviconUrl: string | null; themeConfig: unknown }) => ({
  id: store.id,
  slug: store.slug,
  name: store.name,
  logoUrl: store.logoUrl,
  faviconUrl: store.faviconUrl,
  themeConfig: store.themeConfig,
});

/**
 * Menor valor de frete grátis para a faixa do topo da vitrine. Prefere regras que valem para todo o Brasil;
 * se só houver regras regionais, avisa que vale para algumas regiões.
 */
export function freeShippingSummary(rules: { states: string[]; freeAbove: Prisma.Decimal | null }[]) {
  const withValue = rules.filter((rule): rule is { states: string[]; freeAbove: Prisma.Decimal } => rule.freeAbove !== null);
  const nationwide = withValue.filter(rule => rule.states.length === 0);
  const pool = nationwide.length ? nationwide : withValue;
  if (!pool.length) return null;
  const from = pool.reduce((min, rule) => rule.freeAbove.lt(min) ? rule.freeAbove : min, pool[0].freeAbove);
  return { from: from.toFixed(2), nationwide: nationwide.length > 0 };
}

const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];

@ApiTags('Store')
@Controller('store')
export class StoreController {
  constructor(private readonly prisma: PrismaService, private readonly assets: StoreAssetsService, private readonly storefront: StorefrontService) {}

  @Get('public/:slug')
  async publicInfo(@Param('slug') slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, logoUrl: true, faviconUrl: true, themeConfig: true, whatsappNumber: true, whatsappMessage: true, marketingConfig: true, storefrontOpen: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const { id: storeId, marketingConfig, storefrontOpen, ...rest } = store;
    const [primary, activeTheme, freeRules] = await Promise.all([
      this.prisma.storeDomain.findFirst({ where: { storeId, isPrimary: true, status: 'ACTIVE' }, select: { hostname: true } }),
      this.prisma.themeEnginePublication.findFirst({
        where: { storeId, installation: { status: 'ACTIVE' } },
        orderBy: { version: 'desc' },
        select: {
          version: true, document: true, documentHash: true,
          installation: { select: { release: { select: { manifest: true, version: true, package: { select: { key: true, name: true } } } } } },
        },
      }),
      this.prisma.shippingRule.findMany({ where: { storeId, active: true, freeAbove: { not: null } }, select: { states: true, freeAbove: true } }),
    ]);
    // O documento é declarativo e seu HTML/código nunca é executado. Publica-se apenas conteúdo do tenant e componentes compilados.
    return {
      ...rest,
      publishedTheme: activeTheme ? {
        version: activeTheme.version, document: activeTheme.document, documentHash: activeTheme.documentHash,
        // Só o que a vitrine usa: o manifesto completo (schemas e layout inicial) não precisa trafegar em toda visita.
        release: { version: activeTheme.installation.release.version, package: activeTheme.installation.release.package, manifest: pickManifest(activeTheme.installation.release.manifest) },
      } : null,
      open: storefrontOpen,
      marketing: readMarketingConfig(marketingConfig),
      primaryDomain: primary?.hostname ?? null,
      freeShipping: freeShippingSummary(freeRules),
    };
  }

  @Get()
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  async get(@CurrentStore() storeId: string) {
    return view(await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } }));
  }

  @Patch()
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  async update(@CurrentStore() storeId: string, @Body() dto: UpdateStoreDto, @Req() req: { user: { sub: string } }) {
    const data: Prisma.StoreUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.logoUrl !== undefined) {
      data.logoUrl = dto.logoUrl;
      data.faviconUrl = dto.logoUrl;
    }
    if (dto.themeConfig !== undefined) {
      await this.storefront.legacyPublish(storeId, dto.themeConfig, req.user.sub);
    }
    return view(await this.prisma.store.update({ where: { id: storeId }, data }));
  }

  @Post('logo')
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 1_000_000 },
    fileFilter: (_request, file, callback) => callback(null, acceptedImageTypes.includes(file.mimetype)),
  }))
  async uploadLogo(@CurrentStore() storeId: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('Selecione um arquivo PNG, JPG, WebP ou ICO de até 1 MB.');
    return this.assets.uploadLogo(storeId, file);
  }

  @Post('hero')
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5_000_000 },
    fileFilter: (_request, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
  }))
  async uploadHero(@CurrentStore() storeId: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('Selecione uma imagem PNG, JPG ou WebP de até 5 MB.');
    return this.assets.uploadHero(storeId, file);
  }
}

function pickManifest(manifest: unknown) {
  const value = (manifest ?? {}) as { displayName?: string; slug?: string; version?: string };
  return { displayName: value.displayName, slug: value.slug, version: value.version };
}
