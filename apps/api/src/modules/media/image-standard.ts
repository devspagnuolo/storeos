// sharp 0.35 publica tipos ESM; o projeto compila em CommonJS sem esModuleInterop, então o módulo é lido por require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { MEDIA_GUIDELINES } from './media-kinds';

/** Tamanho padrão das fotos de produto (o mesmo recomendado no painel): 1000×1250, proporção 4:5. */
export const PRODUCT_IMAGE = { width: MEDIA_GUIDELINES.product.width, height: MEDIA_GUIDELINES.product.height };
const NEAR = 0.06;
const MAX_PIXELS = 60_000_000;

/** Quase na proporção padrão: preenche o quadro (corta só a sobra). Fora dela: encaixa inteira sobre fundo branco, sem cortar a peça. */
export function pickFit(width: number, height: number, target = PRODUCT_IMAGE): 'cover' | 'contain' {
  const ratio = width / height;
  const wanted = target.width / target.height;
  return Math.abs(ratio - wanted) / wanted <= NEAR ? 'cover' : 'contain';
}

export type StandardImage = { buffer: Buffer; mime: 'image/jpeg'; width: number; height: number; fit: 'cover' | 'contain' };

/** Converte qualquer foto (JPG, PNG, WebP, GIF…) para o padrão da loja: tamanho fixo, fundo (branco ou a cor dada), JPEG otimizado e orientação corrigida. */
export async function standardizeImage(input: Buffer, target = PRODUCT_IMAGE, background = '#ffffff'): Promise<StandardImage> {
  const base = sharp(input, { failOn: 'none', limitInputPixels: MAX_PIXELS }).rotate();
  const meta = await sharp(await base.clone().toBuffer(), { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Imagem inválida');
  const fit = pickFit(meta.width, meta.height, target);
  const buffer = await base
    .flatten({ background })
    .resize(target.width, target.height, { fit, background, position: 'centre' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  return { buffer, mime: 'image/jpeg', width: target.width, height: target.height, fit };
}
