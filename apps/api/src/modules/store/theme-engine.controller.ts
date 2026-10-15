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

@ApiTags('Theme Engine')
@ApiBearerAuth()
@Controller('themes')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class ThemeEngineController {
  constructor(private readonly themes: ThemeEngineService) {}

  @Get('library')
  listLibrary() { return this.themes.listLibrary(); }

  @Get('installations')
  listInstallations(@CurrentStore() storeId: string) { return this.themes.listInstallations(storeId); }

  @Post('installations')
  install(@CurrentStore() storeId: string, @Body() dto: InstallThemeDto, @Req() req: { user: { sub: string } }) {
    return this.themes.install(storeId, dto.releaseId, req.user.sub);
  }

  @Get('installations/:installationId/draft')
  getDraft(@CurrentStore() storeId: string, @Param('installationId') installationId: string) {
    return this.themes.getDraft(storeId, installationId);
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
