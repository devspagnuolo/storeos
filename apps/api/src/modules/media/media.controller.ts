import { BadRequestException, Controller, ForbiddenException, Get, Header, Param, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { Permissions } from '../../shared/auth/permissions';
import { isMediaKind, MEDIA_GUIDELINES } from './media-kinds';
import { MediaService, UploadedFile } from './media.service';

const MAX_FILES = 12;

@ApiTags('Mídia')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

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
  upload(@CurrentStore() storeId: string, @Query('kind') kind: string | undefined, @UploadedFiles() files: UploadedFile[] = [], @Req() req: { user?: { permissions?: string[] }; protocol: string; get(name: string): string | undefined }) {
    const granted = req.user?.permissions ?? [];
    if (!granted.includes(Permissions.CATALOG_WRITE) && !granted.includes(Permissions.SETTINGS_WRITE)) throw new ForbiddenException('Permissão insuficiente');
    if (kind !== undefined && !isMediaKind(kind)) throw new BadRequestException('Tipo de imagem inválido');
    const origin = (process.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return this.media.upload(storeId, kind && isMediaKind(kind) ? kind : 'other', files, origin);
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
