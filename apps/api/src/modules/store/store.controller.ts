import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { StoreAssetsService } from './store-assets.service';

class UpdateStoreDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) @IsUrl({ protocols: ['https'], require_protocol: true }) logoUrl?: string | null;
}

const view = (store: { id: string; slug: string; name: string; logoUrl: string | null; faviconUrl: string | null }) => ({ id: store.id, slug: store.slug, name: store.name, logoUrl: store.logoUrl, faviconUrl: store.faviconUrl });

@ApiTags('Store')
@Controller('store')
export class StoreController {
  constructor(private readonly prisma: PrismaService, private readonly assets: StoreAssetsService) {}

  @Get('public/:slug')
  async publicInfo(@Param('slug') slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { slug: true, name: true, logoUrl: true, faviconUrl: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return store;
  }

  @Get()
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  async get(@CurrentStore() storeId: string) {
    return view(await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } }));
  }

  @Patch()
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  async update(@CurrentStore() storeId: string, @Body() dto: UpdateStoreDto) {
    const data: { name?: string; logoUrl?: string | null; faviconUrl?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.logoUrl !== undefined) {
      data.logoUrl = dto.logoUrl;
      data.faviconUrl = dto.logoUrl;
    }
    return view(await this.prisma.store.update({ where: { id: storeId }, data }));
  }

  @Post('logo')
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 1_000_000 },
    fileFilter: (_request, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(file.mimetype)),
  }))
  async uploadLogo(@CurrentStore() storeId: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('Selecione um arquivo PNG, JPG, WebP ou ICO de até 1 MB.');
    return this.assets.uploadLogo(storeId, file);
  }
}
