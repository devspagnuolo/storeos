import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
// sharp 0.35 publica tipos ESM; o projeto compila em CommonJS sem esModuleInterop, então o módulo é lido por require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ACCEPTED_IMAGES, matchesSignature } from './image-info';
import { standardizeImage } from './image-standard';
import { MediaService, UploadedFile } from './media.service';
import { inBatches, parsePhotoBackground, PhotoBackground, SAMPLE_CUTOUT_SVG } from './photo-background';
import { composePhoto } from './photo-compose';
import { PhotoroomClient } from './photoroom.client';
import { RemoteImageService } from './remote-image.service';

const PARALLEL = 3;
const FAILED_WARNING = 'Não foi possível trocar o fundo desta foto; ela entrou com o fundo original.';

export type ProductPhoto = { url: string; originalUrl: string | null; width: number; height: number; warning: string | null };

/**
 * Fundo padrão da loja nas fotos de produto: o Photoroom recorta a peça e ela é colocada sobre a cor escolhida.
 * A foto original (já no tamanho padrão) é sempre guardada e ligada à nova em PhotoOriginal, para voltar atrás.
 */
@Injectable()
export class PhotoBackgroundService {
  private readonly logger = new Logger(PhotoBackgroundService.name);
  /** Imagens de fundo já baixadas (uma por loja), para a importação não baixar a mesma a cada foto. */
  private readonly backdrops = new Map<string, { url: string; image: Buffer }>();

  constructor(private readonly prisma: PrismaService, private readonly media: MediaService, private readonly photoroom: PhotoroomClient, private readonly remote: RemoteImageService) {}

  async current(storeId: string): Promise<PhotoBackground> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { photoBackground: true } });
    return parsePhotoBackground(store?.photoBackground);
  }

  /** O painel mostra a escolha e se o recorte está disponível no servidor (chave do Photoroom). */
  async settings(storeId: string) {
    return { ...(await this.current(storeId)), available: this.photoroom.configured, sandbox: this.photoroom.sandbox };
  }

  async save(storeId: string, input: Partial<PhotoBackground>) {
    if (input.style === 'image' && !input.imageUrl) throw new BadRequestException('Envie a imagem de fundo ou escolha outro estilo.');
    const value = parsePhotoBackground(input);
    if (value.enabled && !this.photoroom.configured) throw new BadRequestException('Falta configurar a chave do Photoroom no servidor para ligar o fundo automático.');
    if (value.imageUrl) await this.backdropImage(storeId, value.imageUrl, true);
    await this.prisma.store.update({ where: { id: storeId }, data: { photoBackground: value as Prisma.InputJsonObject } });
    return this.settings(storeId);
  }

  /** O fundo automático só vale com a opção ligada na loja e a chave configurada. */
  async autoEnabled(storeId: string) {
    return this.photoroom.configured && (await this.current(storeId)).enabled;
  }

  /** Fotos enviadas no painel com o fundo automático ligado: cada uma volta com o fundo trocado e a original guardada. */
  async uploadProducts(storeId: string, files: UploadedFile[]) {
    if (!files.length) throw new BadRequestException('Selecione imagens PNG, JPG ou WebP de até 5 MB cada.');
    for (const file of files) if (!ACCEPTED_IMAGES[file.mimetype] || !matchesSignature(file.buffer, file.mimetype)) throw new BadRequestException(`"${file.originalname ?? 'arquivo'}" não é uma imagem PNG, JPG ou WebP válida.`);
    const background = await this.current(storeId);
    const photos = await inBatches(files, PARALLEL, file => this.processNew(storeId, file.buffer, file.originalname ?? 'foto', background));
    return { files: photos.map((photo, i) => ({ ...photo, name: files[i].originalname ?? null, size: files[i].buffer.length })) };
  }

  /**
   * Foto nova de produto (painel ou Bling): padroniza e guarda; com o fundo automático ligado, também troca o fundo.
   * Se o recorte falhar, a foto entra com o fundo original e vem com um aviso, como era antes.
   */
  async processNew(storeId: string, input: Buffer, name: string, background?: PhotoBackground): Promise<ProductPhoto> {
    const choice = background ?? await this.current(storeId);
    const standard = await standardizeImage(input);
    const originalUrl = await this.media.saveProcessed(storeId, 'product', { buffer: standard.buffer, mimetype: standard.mime, width: standard.width, height: standard.height, originalname: this.fileName(name) });
    const plain = { url: originalUrl, originalUrl: null, width: standard.width, height: standard.height, warning: null };
    if (!choice.enabled || !this.photoroom.configured) return plain;
    try {
      return { ...plain, url: await this.replace(storeId, input, choice, originalUrl, name), originalUrl };
    } catch (error) {
      this.logger.warn(`Fundo não trocado em "${name}": ${(error as Error).message}`);
      return { ...plain, warning: FAILED_WARNING };
    }
  }

  /** Foto já cadastrada: aplica o fundo padrão sob demanda, sempre a partir da original (mesmo com o automático desligado). */
  async apply(storeId: string, url: string) {
    if (!this.photoroom.configured) throw new ServiceUnavailableException('O fundo padrão ainda não está disponível: falta configurar a chave do Photoroom no servidor.');
    const known = await this.prisma.photoOriginal.findFirst({ where: { storeId, url }, select: { originalUrl: true } });
    const originalUrl = known?.originalUrl ?? url;
    const input = await this.download(storeId, originalUrl);
    try {
      return { url: await this.replace(storeId, input, await this.current(storeId), originalUrl, 'foto'), originalUrl };
    } catch (error) {
      this.logger.warn(`Fundo não trocado em ${originalUrl}: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível trocar o fundo desta foto agora. Tente de novo em instantes.');
    }
  }

  /** Para cada foto com o fundo trocado, a original correspondente (as demais não aparecem). */
  async originals(storeId: string, urls: string[]) {
    if (!urls.length) return {};
    const rows = await this.prisma.photoOriginal.findMany({ where: { storeId, url: { in: urls } }, select: { url: true, originalUrl: true } });
    return Object.fromEntries(rows.map(row => [row.url, row.originalUrl]));
  }

  /** Prévia do fundo no painel com uma silhueta de exemplo: não chama o Photoroom nem salva nada. */
  async preview(storeId: string, input: Partial<PhotoBackground>) {
    const choice = parsePhotoBackground(input);
    const image = await composePhoto(await sharp(Buffer.from(SAMPLE_CUTOUT_SVG)).png().toBuffer(), await this.backdrop(storeId, choice));
    return sharp(image.buffer).resize(400, 500).jpeg({ quality: 80 }).toBuffer();
  }

  private async backdrop(storeId: string, choice: PhotoBackground) {
    const image = choice.style === 'image' && choice.imageUrl ? await this.backdropImage(storeId, choice.imageUrl) : null;
    return { style: choice.style, color: choice.color, image, shadow: choice.shadow, floor: choice.floor };
  }

  private async backdropImage(storeId: string, url: string, fresh = false) {
    const cached = this.backdrops.get(storeId);
    if (!fresh && cached?.url === url) return cached.image;
    const image = await this.download(storeId, url);
    const meta = await sharp(image, { failOn: 'none' }).metadata().catch(() => undefined);
    if (!meta?.width || !meta.height) throw new BadRequestException('A imagem de fundo não pôde ser lida. Envie um JPG, PNG ou WebP.');
    this.backdrops.set(storeId, { url, image });
    return image;
  }

  private async replace(storeId: string, input: Buffer, choice: PhotoBackground, originalUrl: string, name: string) {
    const cutout = await this.photoroom.removeBackground(input);
    const image = await composePhoto(cutout, await this.backdrop(storeId, choice));
    const url = await this.media.saveProcessed(storeId, 'product', { buffer: image.buffer, mimetype: image.mime, width: image.width, height: image.height, originalname: this.fileName(name) });
    await this.prisma.photoOriginal.create({ data: { storeId, url, originalUrl } });
    return url;
  }

  /** Só baixa fotos desta loja: guardadas no banco, no R2 da loja ou já usadas num produto dela. */
  private async download(storeId: string, url: string): Promise<Buffer> {
    const api = (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, '');
    const local = url.match(/\/api\/v1\/media\/([0-9a-f-]{36})$/i);
    if (local && (!api || url.startsWith(`${api}/`))) {
      const asset = await this.prisma.mediaAsset.findFirst({ where: { id: local[1], storeId }, select: { data: true } });
      if (asset) return Buffer.from(asset.data);
    }
    const r2 = (process.env.STOREOS_R2_PUBLIC_URL ?? '').replace(/\/$/, '');
    const ownR2 = Boolean(r2) && url.startsWith(`${r2}/stores/${encodeURIComponent(storeId)}/`);
    const used = ownR2 || Boolean(await this.prisma.productImage.findFirst({ where: { url, product: { storeId } }, select: { id: true } }));
    if (!used) throw new BadRequestException('Essa foto não é desta loja.');
    try {
      return await this.remote.download(url);
    } catch (error) {
      throw new BadRequestException(`Não foi possível abrir a foto (${(error as Error).message}).`);
    }
  }

  private fileName(name: string) {
    return `${name.replace(/\.[a-z0-9]+$/i, '').slice(0, 100) || 'foto'}.jpg`;
  }
}
