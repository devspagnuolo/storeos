import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsString, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { ThemeEngineService } from './theme-engine.service';

class InstallThemeDto {
  @IsString() releaseId!: string;
}

class SaveThemeDraftDto {
  @IsInt() @Min(1) revision!: number;
  @IsObject() document!: Record<string, unknown>;
}

class RestoreThemeDto {
  @IsInt() @Min(1) revision!: number;
}

class PublishThemeDto {
  @IsInt() @Min(1) revision!: number;
}

@ApiTags('Theme Engine')
@ApiBearerAuth()
@Controller('themes')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class ThemeEngineController {
  constructor(private readonly themes: ThemeEngineService) {}

  @Get('library')
  listLibrary() { return this.themes.listLibrary(); }

  @Get('status')
  status(@CurrentStore() storeId: string) { return this.themes.status(storeId); }

  @Get('publications')
  publications(@CurrentStore() storeId: string) { return this.themes.listPublications(storeId); }

  @Post('publications/:publicationId/restore')
  restore(@CurrentStore() storeId: string, @Param('publicationId') publicationId: string, @Body() dto: RestoreThemeDto, @Req() req: { user: { sub: string } }) {
    return this.themes.restorePublication(storeId, publicationId, dto.revision, req.user.sub);
  }

  @Post('installations/:installationId/validate')
  validate(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.validate(storeId, installationId);
  }

  @Get('installations')
  listInstallations(@CurrentStore() storeId: string) { return this.themes.listInstallations(storeId); }

  @Post('installations')
  install(@CurrentStore() storeId: string, @Body() dto: InstallThemeDto, @Req() req: { user: { sub: string } }) {
    return this.themes.install(storeId, dto.releaseId, req.user.sub);
  }

  /** Leva a loja atual (editor clássico) para o editor de temas como rascunho. Não publica. */
  @Post('installations/from-storefront')
  fromStorefront(@CurrentStore() storeId: string, @Req() req: { user: { sub: string } }) {
    return this.themes.fromStorefront(storeId, req.user.sub);
  }

  /** Deixa a loja no editor novo: sem tema no ar, publica a conversão do editor clássico. Sem efeito quando já há tema no ar. */
  @Post('current')
  ensureCurrent(@CurrentStore() storeId: string, @Req() req: { user: { sub: string } }) {
    return this.themes.ensureCurrent(storeId, req.user.sub);
  }

  @Post('installations/:installationId/keep')
  keep(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.keepDraft(storeId, installationId);
  }

  @Post('installations/:installationId/discard')
  discard(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.discardDraft(storeId, installationId);
  }

  @Get('installations/:installationId/draft')
  getDraft(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.getDraft(storeId, installationId);
  }

  /** Responde `{ publication: null }` quando o tema nunca foi publicado (o corpo vazio confundiria o cliente). */
  @Get('installations/:installationId/published')
  async latestPublication(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return { publication: await this.themes.latestPublication(storeId, installationId) };
  }

  @Post('installations/:installationId/publish')
  publish(
    @CurrentStore() storeId: string,
    @Param('installationId') installationId: string,
    @Body() dto: PublishThemeDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.themes.publish(storeId, installationId, dto.revision, req.user.sub);
  }

  @Post('installations/:installationId/upgrade')
  upgrade(@CurrentStore() storeId: string, @Param('installationId') installationId: string, @Req() req: { user: { sub: string } }) {
    return this.themes.upgrade(storeId, installationId, req.user.sub);
  }

  @Post('installations/:installationId/deactivate')
  deactivate(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.deactivate(storeId, installationId);
  }

  @Patch('installations/:installationId/draft')
  saveDraft(
    @CurrentStore() storeId: string,
    @Param('installationId') installationId: string,
    @Body() dto: SaveThemeDraftDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.themes.saveDraft(storeId, installationId, dto.revision, dto.document, req.user.sub);
  }
}
