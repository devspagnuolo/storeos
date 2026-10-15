// sharp 0.35 publica tipos ESM; o projeto compila em CommonJS sem esModuleInterop, então o módulo é lido por require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { pickFit, PRODUCT_IMAGE, standardizeImage } from './image-standard';
import { isPublicAddress } from './safe-fetch';

describe('image-standard', () => {
  it('escolhe o encaixe pela proporção', () => {
    expect(pickFit(800, 1000)).toBe('cover');
    expect(pickFit(1500, 1000)).toBe('contain');
    expect(pickFit(1000, 1000)).toBe('contain');
  });
  it('padroniza tamanho, formato e fundo', async () => {
    const wide = await sharp({ create: { width: 1600, height: 900, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const out = await standardizeImage(wide);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([PRODUCT_IMAGE.width, PRODUCT_IMAGE.height, 'jpeg']);
    expect(out.fit).toBe('contain');
    const corner = await sharp(out.buffer).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
    expect([...corner].every(v => v > 240)).toBe(true); // faixa de cima é branca
  });
  it('rejeita lixo', async () => {
    await expect(standardizeImage(Buffer.from('não é imagem'))).rejects.toThrow();
  });
});

describe('safe-fetch', () => {
  it('bloqueia endereços internos', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', '::ffff:10.0.0.1', '100.64.0.1']) expect(isPublicAddress(a)).toBe(false);
    for (const a of ['8.8.8.8', '151.101.1.1', '2606:4700::1111']) expect(isPublicAddress(a)).toBe(true);
  });
});
