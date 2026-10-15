import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { StoreAssetsService } from '../store/store-assets.service';
import { ACCEPTED_IMAGES, imageInfo, matchesSignature } from './image-info';
import { MediaKind, sizeWarning } from './media-kinds';

export type UploadedFile = { buffer: Buffer; mimetype: string; originalname?: string };

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService, private readonly assets: StoreAssetsService) {}

  /** Salva as imagens (R2 se estiver configurado, senão no próprio banco) e devolve URL, dimensões e aviso de tamanho. */
  async upload(storeId: string, kind: MediaKind, files: UploadedFile[], origin: string) {
    if (!files.length) throw new BadRequestException('Selecione imagens PNG, JPG ou WebP de até 5 MB cada.');
    const results = [];
    for (const file of files) {
      if (!ACCEPTED_IMAGES[file.mimetype] || !matchesSignature(file.buffer, file.mimetype)) throw new BadRequestException(`"${file.originalname ?? 'arquivo'}" não é uma imagem PNG, JPG ou WebP válida.`);
      const info = imageInfo(file.buffer, file.mimetype);
      const url = this.assets.configured
        ? await this.assets.uploadImage(storeId, file, 'media')
        : `${origin}/api/v1/media/${(await this.prisma.mediaAsset.create({ data: { storeId, kind, mime: file.mimetype, size: file.buffer.length, width: info?.width, height: info?.height, name: file.originalname?.slice(0, 120), data: new Uint8Array(file.buffer) }, select: { id: true } })).id}`;
      results.push({ url, name: file.originalname ?? null, width: info?.width ?? null, height: info?.height ?? null, size: file.buffer.length, warning: sizeWarning(kind, info) ?? null });
    }
    return { files: results };
  }

  /** Guarda uma imagem já tratada pelo servidor (ex.: importação de produtos) e devolve a URL pública. */
  async saveProcessed(storeId: string, kind: MediaKind, file: { buffer: Buffer; mimetype: string; originalname?: string; width?: number; height?: number }) {
    if (this.assets.configured) return this.assets.uploadImage(storeId, file, 'media');
    const origin = (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, '');
    const asset = await this.prisma.mediaAsset.create({ data: { storeId, kind, mime: file.mimetype, size: file.buffer.length, width: file.width, height: file.height, name: file.originalname?.slice(0, 120), data: new Uint8Array(file.buffer) }, select: { id: true } });
    return `${origin}/api/v1/media/${asset.id}`;
  }

  async read(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { mime: true, data: true } }).catch(() => null);
    if (!asset) throw new NotFoundException('Imagem não encontrada');
    return asset;
  }
}
