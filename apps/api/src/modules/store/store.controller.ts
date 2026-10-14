import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

class UpdateStoreDto { @IsString() @Length(2, 80) name!: string; }

const view = ({ id, slug, name }: { id: string; slug: string; name: string }) => ({ id, slug, name });

/** Dados básicos da loja. O slug fica fixo: ele está nos links e na configuração da vitrine. */
@ApiTags('Store') @Controller('store') export class StoreController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('public/:slug') async publicInfo(@Param('slug') slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    return { slug: store.slug, name: store.name };
  }
  @Get() @RequirePermissions(Permissions.SETTINGS_WRITE) async get(@CurrentStore() storeId: string) { return view(await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } })); }
  @Patch() @RequirePermissions(Permissions.SETTINGS_WRITE) async update(@CurrentStore() storeId: string, @Body() dto: UpdateStoreDto) { return view(await this.prisma.store.update({ where: { id: storeId }, data: { name: dto.name.trim() } })); }
}
