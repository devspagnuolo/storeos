import { Injectable } from '@nestjs/common';
// sharp 0.35 publica tipos ESM; o projeto compila em CommonJS sem esModuleInterop, então o módulo é lido por require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');

const ENDPOINT = 'https://sdk.photoroom.com/v1/segment';
const TIMEOUT_MS = 45_000;
/** A foto vai reduzida: o recorte volta no mesmo tamanho e a loja usa 1000×1250, então não precisa mandar mais que isso. */
const SEND_MAX = { width: 2000, height: 2500 };

/** Recorte de fundo do Photoroom. Sem PHOTOROOM_API_KEY fica desligado; chave começando com "sandbox_" é de teste (grátis, com marca d'água). */
@Injectable()
export class PhotoroomClient {
  get configured() { return Boolean(process.env.PHOTOROOM_API_KEY?.trim()); }
  get sandbox() { return Boolean(process.env.PHOTOROOM_API_KEY?.trim().startsWith('sandbox_')); }

  /** Devolve a peça recortada em PNG com fundo transparente, no tamanho da foto enviada. */
  async removeBackground(image: Buffer): Promise<Buffer> {
    const key = process.env.PHOTOROOM_API_KEY?.trim();
    if (!key) throw new Error('Photoroom não configurado');
    const sent = await sharp(image, { failOn: 'none', limitInputPixels: 60_000_000 }).rotate()
      .resize({ ...SEND_MAX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const form = new FormData();
    form.append('image_file', new Blob([new Uint8Array(sent)], { type: 'image/jpeg' }), 'foto.jpg');
    form.append('format', 'png');
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-api-key': key }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Photoroom respondeu ${response.status}${response.status === 402 ? ' (créditos esgotados)' : ''}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
