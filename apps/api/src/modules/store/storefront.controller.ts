import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { StorefrontService } from './storefront.service';

class SaveStorefrontDto {
  @IsInt() @Min(0) @Max(2147483646) version!: number;
  @IsObject() config!: Record<string, unknown>;
}
class RestoreStorefrontDto {
  @IsInt() @Min(0) @Max(2147483646) version!: number;
  @IsString() @MaxLength(100) publicationId!: string;
}
type Actor = { user: { sub: string } };

@ApiTags('Storefront')
@Controller('store/storefront')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar rascunho privado, versão atual e histórico da loja autenticada' })
  get(@CurrentStore() storeId: string) { return this.storefront.get(storeId); }

  @Get('publications/:id')
  @ApiOperation({ summary: 'Consultar a configuração de uma publicação (para comparar versões)' })
  publication(@CurrentStore() storeId: string, @Param('id') id: string) { return this.storefront.getPublication(storeId, id); }

  @Patch('draft')
  @ApiOperation({ summary: 'Salvar rascunho sem alterar a vitrine pública; 409 se a versão mudou' })
  save(@CurrentStore() storeId: string, @Body() dto: SaveStorefrontDto, @Req() req: Actor) {
    return this.storefront.save(storeId, dto.version, dto.config, false, req.user.sub);
  }

  @Post('publish') @HttpCode(200)
  @ApiOperation({ summary: 'Publicar alterações atomicamente e preservar a versão anterior' })
  publish(@CurrentStore() storeId: string, @Body() dto: SaveStorefrontDto, @Req() req: Actor) {
    return this.storefront.save(storeId, dto.version, dto.config, true, req.user.sub);
  }

  @Post('restore') @HttpCode(200)
  @ApiOperation({ summary: 'Restaurar uma publicação da mesma loja como rascunho' })
  restore(@CurrentStore() storeId: string, @Body() dto: RestoreStorefrontDto, @Req() req: Actor) {
    return this.storefront.restore(storeId, dto.version, dto.publicationId, req.user.sub);
  }
}
