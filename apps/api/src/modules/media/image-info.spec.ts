import { imageInfo, matchesSignature } from './image-info';
import { sizeWarning } from './media-kinds';

const png = (width: number, height: number) => {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'ascii'); buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
};
const jpeg = (width: number, height: number) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.alloc(11); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(11, 2); sof[4] = 8; sof.writeUInt16BE(height, 5); sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
};
const webpX = (width: number, height: number) => {
  const buffer = Buffer.alloc(30); buffer.write('RIFF', 0, 'ascii'); buffer.write('WEBP', 8, 'ascii'); buffer.write('VP8X', 12, 'ascii');
  buffer.writeUIntLE(width - 1, 24, 3); buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
};

describe('image-info', () => {
  it('lê dimensões de PNG, JPEG e WebP', () => {
    expect(imageInfo(png(1920, 700), 'image/png')).toEqual({ width: 1920, height: 700 });
    expect(imageInfo(jpeg(800, 1000), 'image/jpeg')).toEqual({ width: 800, height: 1000 });
    expect(imageInfo(webpX(1000, 1250), 'image/webp')).toEqual({ width: 1000, height: 1250 });
  });

  it('não quebra com cabeçalho truncado', () => {
    expect(imageInfo(Buffer.from([137, 80]), 'image/png')).toBeUndefined();
    expect(imageInfo(Buffer.from([0xff, 0xd8]), 'image/jpeg')).toBeUndefined();
  });

  it('confere a assinatura do arquivo', () => {
    expect(matchesSignature(png(1, 1), 'image/png')).toBe(true);
    expect(matchesSignature(Buffer.from('<svg/>'), 'image/png')).toBe(false);
  });

  it('avisa quando a imagem é pequena ou de outra proporção', () => {
    expect(sizeWarning('banner', { width: 1920, height: 700 })).toBeUndefined();
    expect(sizeWarning('banner', { width: 900, height: 330 })).toMatch(/borrada/);
    expect(sizeWarning('banner', { width: 1920, height: 1920 })).toMatch(/proporção/);
    expect(sizeWarning('other', { width: 10, height: 10 })).toBeUndefined();
  });
});
