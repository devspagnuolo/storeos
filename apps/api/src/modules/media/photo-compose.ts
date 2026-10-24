// sharp 0.35 publica tipos ESM; o projeto compila em CommonJS sem esModuleInterop, então o módulo é lido por require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { pickFit, PRODUCT_IMAGE, StandardImage } from './image-standard';

/** Liso (só a cor), estúdio (luz suave e chão na cor da loja) ou imagem enviada pelo lojista. */
export type BackdropStyle = 'flat' | 'studio' | 'image';
/** `floor`: altura do chão na imagem de fundo (0 a 1, de cima para baixo); a modelo de corpo inteiro é posta de pé nessa linha. */
export type Backdrop = { style: BackdropStyle; color: string; image?: Buffer | null; shadow: boolean; floor?: number | null };

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Mistura a cor com branco (amount > 0) ou preto (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const parts = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).map(v => Math.round(v + (target - v) * Math.abs(amount)));
  return `#${parts.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Fundo de estúdio: luz mais clara atrás da peça e um chão levemente mais escuro, sem linha marcada. */
function studio(color: string, { width, height }: { width: number; height: number }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="luz" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="${shade(color, 0.45)}"/><stop offset="0.55" stop-color="${shade(color, 0.12)}"/><stop offset="1" stop-color="${shade(color, -0.06)}"/></radialGradient>
    <linearGradient id="chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, -0.1)}" stop-opacity="0"/><stop offset="1" stop-color="${shade(color, -0.12)}" stop-opacity="0.9"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#luz)"/>
  <rect y="${Math.round(height * 0.66)}" width="${width}" height="${Math.round(height * 0.34)}" fill="url(#chao)"/>
</svg>`);
}

async function backdrop(choice: Backdrop, target: { width: number; height: number }) {
  if (choice.style === 'image' && choice.image) {
    return sharp(choice.image, { failOn: 'none', limitInputPixels: 60_000_000 }).rotate().resize(target.width, target.height, { fit: 'cover', position: 'centre' }).flatten({ background: choice.color }).png().toBuffer();
  }
  if (choice.style === 'studio') return sharp(studio(choice.color, target)).png().toBuffer();
  return sharp({ create: { ...target, channels: 3, background: choice.color } }).png().toBuffer();
}

/** Contorno da peça (pelo canal de transparência): onde ela começa embaixo e a largura perto do pé. */
async function footprint(subject: Buffer, { width, height }: { width: number; height: number }) {
  const alpha = await sharp(subject).extractChannel(3).raw().toBuffer();
  let top = -1;
  for (let y = 0; y < height && top < 0; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) { top = y; break; }
  let minX = width, maxX = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  let bottom = -1;
  for (let y = height - 1; y >= 0 && bottom < 0; y--) {
    let solid = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) solid++;
    if (solid > 3) bottom = y;
  }
  if (bottom < 0) return null;
  const band = Math.max(4, Math.round(height * 0.04));
  let left = width, right = -1;
  for (let y = Math.max(0, bottom - band); y <= bottom; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 128) { left = Math.min(left, x); right = Math.max(right, x); }
  return { top, bottom, left, right, minX, maxX };
}

/** Modelo de corpo inteiro: reduz (se preciso) e desloca para os pés ficarem na linha do chão da imagem de fundo. */
async function standOnFloor(subject: Buffer, floor: number, target: { width: number; height: number }) {
  const foot = await footprint(subject, target);
  if (!foot || foot.bottom >= target.height - 6 || foot.top < 0) return subject; // peça cortada embaixo: fica como está
  const floorY = Math.round(target.height * floor);
  const height = foot.bottom - foot.top + 1;
  const scale = Math.min(1, (floorY - target.height * 0.03) / height);
  const box = { left: foot.minX, top: foot.top, width: foot.maxX - foot.minX + 1, height };
  const piece = await sharp(subject).extract(box).resize(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale))).png().toBuffer();
  const size = { width: Math.max(1, Math.round(box.width * scale)), height: Math.max(1, Math.round(box.height * scale)) };
  const centre = box.left + box.width / 2;
  const left = Math.min(Math.max(0, Math.round(centre - size.width / 2)), target.width - size.width);
  const top = Math.min(Math.max(0, floorY - size.height), target.height - size.height);
  return sharp({ create: { ...target, channels: 4, background: TRANSPARENT } }).composite([{ input: piece, left, top }]).png().toBuffer();
}

async function shadows(subject: Buffer, target: { width: number; height: number }) {
  const layers: { input: Buffer; top: number; left: number }[] = [];
  const foot = await footprint(subject, target);
  // Sombra de contato: só quando a peça (ou a modelo) termina dentro da foto, ou seja, "pisa" no chão.
  if (foot && foot.bottom < target.height - 6) {
    const rx = Math.max(40, (foot.right - foot.left) * 0.62);
    const ry = Math.max(10, rx * 0.11);
    const cx = (foot.left + foot.right) / 2;
    layers.push({ input: await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(ry * 0.9).toFixed(1)}"/></filter></defs><ellipse cx="${cx.toFixed(1)}" cy="${(foot.bottom - ry * 0.2).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#000" fill-opacity="0.42" filter="url(#b)"/></svg>`)).png().toBuffer(), top: 0, left: 0 });
  }
  // Sombra projetada suave, levemente abaixo e à direita, para a peça não parecer "colada".
  const offset = { x: 18, y: 8 };
  const blurred = await sharp(await sharp(subject).extractChannel(3).png().toBuffer()).blur(40).extractChannel(0).raw().toBuffer();
  const soft = Buffer.alloc(target.width * target.height * 4);
  for (let i = 0; i < blurred.length; i++) soft[i * 4 + 3] = Math.round(blurred[i] * 0.2);
  const softPng = await sharp(soft, { raw: { ...target, channels: 4 } }).png().toBuffer();
  layers.push({ input: await sharp(softPng).extract({ left: 0, top: 0, width: target.width - offset.x, height: target.height - offset.y }).png().toBuffer(), top: offset.y, left: offset.x });
  return layers;
}

/** Coloca a peça recortada (PNG transparente) sobre o fundo escolhido, no tamanho padrão da loja. */
export async function composePhoto(cutout: Buffer, choice: Backdrop, target = PRODUCT_IMAGE): Promise<StandardImage> {
  const meta = await sharp(cutout, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Recorte inválido');
  const fit = pickFit(meta.width, meta.height, target);
  const framed = await sharp(cutout, { failOn: 'none', limitInputPixels: 60_000_000 }).ensureAlpha().resize(target.width, target.height, { fit, background: TRANSPARENT, position: 'centre' }).png().toBuffer();
  const subject = choice.style === 'image' && choice.floor ? await standOnFloor(framed, choice.floor, target) : framed;
  const layers = choice.shadow ? await shadows(subject, target) : [];
  const buffer = await sharp(await backdrop(choice, target)).composite([...layers, { input: subject, top: 0, left: 0 }]).flatten({ background: choice.color }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { buffer, mime: 'image/jpeg', width: target.width, height: target.height, fit };
}
