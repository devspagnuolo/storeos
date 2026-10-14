export type ImageInfo = { width: number; height: number };

/** Lê largura e altura direto do cabeçalho (PNG, JPEG, WebP), sem decodificar a imagem nem depender de bibliotecas nativas. */
export function imageInfo(buffer: Buffer, mime: string): ImageInfo | undefined {
  try {
    if (mime === 'image/png') return buffer.length >= 24 ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : undefined;
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const marker = buffer[offset + 1];
        // SOF0..SOF15, exceto DHT (c4), JPG (c8) e DAC (cc): carregam as dimensões.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
      return undefined;
    }
    if (mime === 'image/webp') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
  } catch {
    // Cabeçalho truncado: segue sem dimensões, o arquivo ainda é aceito.
  }
  return undefined;
}

export const ACCEPTED_IMAGES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Confere os primeiros bytes: o tipo declarado pelo navegador não basta para aceitar o arquivo. */
export function matchesSignature(buffer: Buffer, mime: string) {
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
