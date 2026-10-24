// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { standardizeImage } from './image-standard';
import { inBatches, parsePhotoBackground, SAMPLE_CUTOUT_SVG } from './photo-background';
import { composePhoto, shade } from './photo-compose';
import { PhotoBackgroundService } from './photo-background.service';

const pixel = async (image: Buffer, left: number, top: number) => [...await sharp(image).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()];
const photo = () => sharp({ create: { width: 800, height: 1000, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();
/** Recorte de mentira: um quadrado vermelho no meio, o resto transparente. */
const cutout = async () => sharp({ create: { width: 800, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 220, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 300, top: 400 }])
  .png().toBuffer();

function setup({ enabled = true, configured = true, failing = false } = {}) {
  const saved: Buffer[] = [];
  const links: { url: string; originalUrl: string }[] = [];
  const prisma = {
    store: { findUnique: jest.fn(async () => ({ photoBackground: { enabled, color: '#e8e0d0', style: 'flat', shadow: false } })), update: jest.fn() },
    photoOriginal: {
      create: jest.fn(async ({ data }) => { links.push(data); return data; }),
      findFirst: jest.fn(async ({ where }) => links.find(l => l.url === where.url) ?? null),
      findMany: jest.fn(async ({ where }) => links.filter(l => where.url.in.includes(l.url))),
    },
    mediaAsset: { findFirst: jest.fn() },
    productImage: { findFirst: jest.fn(async () => null) },
  };
  const media = { saveProcessed: jest.fn(async (_s: string, _k: string, file: { buffer: Buffer }) => { saved.push(file.buffer); return `https://img.test/${saved.length}.jpg`; }) };
  const photoroom = { configured, sandbox: false, removeBackground: jest.fn(async () => { if (failing) throw new Error('Photoroom respondeu 402'); return cutout(); }) };
  const remote = { download: jest.fn(async () => photo()) };
  const service = new PhotoBackgroundService(prisma as never, media as never, photoroom as never, remote as never);
  return { service, saved, links, photoroom, remote };
}

describe('fundo padrão das fotos', () => {
  it('lê a escolha da loja com padrão desligado', () => {
    const base = { style: 'studio', imageUrl: null, shadow: true, floor: 0.88 };
    expect(parsePhotoBackground(null)).toEqual({ enabled: false, color: '#F2F2F2', ...base });
    expect(parsePhotoBackground({ enabled: true, color: '#abcdef' })).toEqual({ enabled: true, color: '#ABCDEF', ...base });
    expect(parsePhotoBackground({ enabled: 'sim', color: 'red', style: 'neon' })).toEqual({ enabled: false, color: '#F2F2F2', ...base });
    // "Minha imagem" sem imagem salva vira estúdio; link que não é https é descartado.
    expect(parsePhotoBackground({ style: 'image', imageUrl: 'http://x.test/a.jpg', shadow: false })).toMatchObject({ style: 'studio', imageUrl: null, shadow: false });
    expect(parsePhotoBackground({ style: 'image', imageUrl: 'https://x.test/a.jpg' })).toMatchObject({ style: 'image', imageUrl: 'https://x.test/a.jpg' });
  });

  it('roda em lotes mantendo a ordem', async () => {
    let running = 0, peak = 0;
    const out = await inBatches([5, 1, 3, 2, 4], 2, async n => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, n)); running--; return n * 10; });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });

  it('compõe o recorte sobre a cor escolhida', async () => {
    const out = await standardizeImage(await cutout(), undefined, '#e8e0d0');
    const [r, g, b] = await pixel(out.buffer, 5, 5);
    expect(Math.abs(r - 0xe8) + Math.abs(g - 0xe0) + Math.abs(b - 0xd0)).toBeLessThan(12);
    const [cr] = await pixel(out.buffer, 500, 625);
    expect(cr).toBeGreaterThan(180); // a peça continua no meio
  });

  it('estúdio: luz no centro, chão mais escuro e sombra sob os pés', async () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
    const cut = await sharp(Buffer.from(SAMPLE_CUTOUT_SVG)).png().toBuffer();
    const out = (await composePhoto(cut, { style: 'studio', color: '#E8E0D0', shadow: true })).buffer;
    const lum = async (x: number, y: number) => (await pixel(out, x, y)).reduce((a, b) => a + b, 0);
    expect(await lum(500, 60)).toBeGreaterThan(await lum(20, 1240)); // fundo claro em cima, chão mais escuro
    // Os pés da silhueta terminam perto de y=934 (de 1000) → ~1167 no quadro de 1250; a sombra fica logo abaixo, entre os pés.
    expect(await lum(500, 1172)).toBeLessThan(await lum(120, 1172) - 15);
    const flat = (await composePhoto(cut, { style: 'flat', color: '#E8E0D0', shadow: false })).buffer;
    expect(await pixel(flat, 500, 1172)).toEqual(await pixel(flat, 120, 1172));
  });

  it('imagem de fundo do lojista cobre o quadro inteiro', async () => {
    const wall = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#20a060' } }).png().toBuffer();
    const out = (await composePhoto(await cutout(), { style: 'image', color: '#FFFFFF', image: wall, shadow: false })).buffer;
    const [r, g, b] = await pixel(out, 5, 5);
    expect(g).toBeGreaterThan(r + 80);
    expect(g).toBeGreaterThan(b + 40);
  });

  it('com imagem de fundo, a modelo de corpo inteiro pisa na linha do chão', async () => {
    const wall = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#d0c0b0' } }).png().toBuffer();
    const cut = await sharp(Buffer.from(SAMPLE_CUTOUT_SVG)).png().toBuffer();
    const lowest = async (image: Buffer) => {
      const raw = await sharp(image).raw().toBuffer();
      for (let y = 1249; y >= 0; y--) for (let x = 0; x < 1000; x++) if (raw[(y * 1000 + x) * 3] < 80 && raw[(y * 1000 + x) * 3 + 1] < 80) return y; // sapatos escuros
      return -1;
    };
    const out = (await composePhoto(cut, { style: 'image', color: '#FFFFFF', image: wall, shadow: false, floor: 0.8 })).buffer;
    expect(Math.abs(await lowest(out) - 1000)).toBeLessThan(6);
    // Peça cortada embaixo (sem pés na foto) não é mexida.
    expect(await lowest((await composePhoto(await cutout(), { style: 'image', color: '#FFFFFF', image: wall, shadow: false, floor: 0.8 })).buffer)).toBe(-1);
  });

  it('foto nova com o automático ligado: troca o fundo e guarda a original', async () => {
    const { service, saved, links } = setup();
    const result = await service.processNew('loja', await photo(), 'Vestido');
    expect(result).toMatchObject({ url: 'https://img.test/2.jpg', originalUrl: 'https://img.test/1.jpg', warning: null });
    expect(links).toEqual([{ storeId: 'loja', url: 'https://img.test/2.jpg', originalUrl: 'https://img.test/1.jpg' }]);
    const [r, g, b] = await pixel(saved[1], 5, 5);
    expect([r > 220, g > 210, b > 195]).toEqual([true, true, true]);
    expect(await pixel(saved[0], 5, 5)).not.toEqual([r, g, b]); // a original fica como veio
  });

  it('desligado ou sem chave: a foto entra como sempre, sem chamar o Photoroom', async () => {
    for (const options of [{ enabled: false }, { configured: false }]) {
      const { service, photoroom, links } = setup(options);
      expect(await service.processNew('loja', await photo(), 'Blusa')).toMatchObject({ url: 'https://img.test/1.jpg', originalUrl: null, warning: null });
      expect(photoroom.removeBackground).not.toHaveBeenCalled();
      expect(links).toHaveLength(0);
    }
  });

  it('recorte com falha não perde a foto', async () => {
    const { service } = setup({ failing: true });
    const result = await service.processNew('loja', await photo(), 'Saia');
    expect(result).toMatchObject({ url: 'https://img.test/1.jpg', originalUrl: null });
    expect(result.warning).toMatch(/fundo original/);
  });

  it('aplicar de novo parte sempre da original e só aceita fotos da loja', async () => {
    const { service, links, remote } = setup({ enabled: false });
    process.env.STOREOS_R2_PUBLIC_URL = 'https://r2.test';
    const first = await service.apply('loja', 'https://r2.test/stores/loja/media/a.jpg');
    expect(first.originalUrl).toBe('https://r2.test/stores/loja/media/a.jpg');
    const again = await service.apply('loja', first.url);
    expect(again.originalUrl).toBe('https://r2.test/stores/loja/media/a.jpg');
    expect(remote.download).toHaveBeenLastCalledWith('https://r2.test/stores/loja/media/a.jpg');
    expect(await service.originals('loja', [first.url, again.url, 'https://outra.test/x.jpg'])).toEqual({ [first.url]: first.originalUrl, [again.url]: first.originalUrl });
    await expect(service.apply('loja', 'https://r2.test/stores/outra/media/b.jpg')).rejects.toThrow('não é desta loja');
    expect(links).toHaveLength(2);
    delete process.env.STOREOS_R2_PUBLIC_URL;
  });
});
