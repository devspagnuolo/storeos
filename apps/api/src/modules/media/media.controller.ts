import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, Param, Post, Put, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches, MaxLength } from 'class-validator';
import { Response } from 'express';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { isMediaKind, MEDIA_GUIDELINES } from './media-kinds';
import { MediaService, UploadedFile } from './media.service';
import { HEX_COLOR } from './photo-background';
import { PhotoBackgroundService } from './photo-background.service';

const MAX_FILES = 12;

type PanelRequest = { user?: { permissions?: string[] }; protocol: string; get(name: string): string | undefined };
class BackgroundDto { @IsBoolean() enabled!: boolean; @IsString() @Matches(HEX_COLOR, { message: 'Use uma cor no formato #RRGGBB.' }) color!: string; }
class PhotoUrlDto { @IsString() @MaxLength(2000) url!: string; }
class PhotoUrlsDto { @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(2000, { each: true }) urls!: string[]; }

/** Fotos e fundo: basta ter permissão de catálogo ou de configurações. */
function assertMediaPermission(req: PanelRequest) {
  const granted = req.user?.permissions ?? [];
  if (!granted.includes(Permissions.CATALOG_WRITE) && !granted.includes(Permissions.SETTINGS_WRITE)) throw new ForbiddenException('Permissão insuficiente');
}

@ApiTags('Mídia')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService, private readonly background: PhotoBackgroundService) {}

  /** Várias imagens de uma vez (carrossel, galeria do produto). Basta ter permissão de catálogo ou de configurações. */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, {
    limits: { fileSize: 5_000_000, files: MAX_FILES },
    fileFilter: (_request, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
  }))
  async upload(@CurrentStore() storeId: string, @Query('kind') kind: string | undefined, @UploadedFiles() files: UploadedFile[] = [], @Req() req: PanelRequest) {
    assertMediaPermission(req);
    if (kind !== undefined && !isMediaKind(kind)) throw new BadRequestException('Tipo de imagem inválido');
    if (kind === 'product' && await this.background.autoEnabled(storeId)) return this.background.uploadProducts(storeId, files);
    const origin = (process.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return this.media.upload(storeId, kind && isMediaKind(kind) ? kind : 'other', files, origin);
  }

  /** Fundo padrão das fotos de produto: a escolha da loja e se o recorte está disponível. */
  @Get('background')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  backgroundSettings(@CurrentStore() storeId: string, @Req() req: PanelRequest) {
    assertMediaPermission(req);
    return this.background.settings(storeId);
  }

  @Put('background')
  @RequirePermissions(Permissions.SETTINGS_WRITE)
  saveBackground(@CurrentStore() storeId: string, @Body() dto: BackgroundDto) {
    return this.background.save(storeId, dto);
  }

  /** Troca o fundo de uma foto já cadastrada (cada uso consome um crédito do Photoroom). */
  @Post('background/apply')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  applyBackground(@CurrentStore() storeId: string, @Body() { url }: PhotoUrlDto, @Req() req: PanelRequest) {
    assertMediaPermission(req);
    return this.background.apply(storeId, url);
  }

  /** Original de cada foto com o fundo trocado, para o painel oferecer "Voltar à original". */
  @Post('background/originals')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  originals(@CurrentStore() storeId: string, @Body() { urls }: PhotoUrlsDto, @Req() req: PanelRequest) {
    assertMediaPermission(req);
    return this.background.originals(storeId, urls);
  }

  @Get('guidelines')
  guidelines() {
    return MEDIA_GUIDELINES;
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.media.read(id);
    res.type(asset.mime).send(Buffer.from(asset.data));
  }
}
