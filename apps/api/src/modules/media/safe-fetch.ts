import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Endereços internos nunca podem ser buscados a pedido de um cadastro externo (SSRF). */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === '::1' || a === '::' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return false;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPublicAddress(mapped[1]) : true;
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

const MAX_BYTES = 10_000_000;
const MAX_REDIRECTS = 3;

/** Baixa uma imagem https pública, com limite de tamanho, tempo e redirecionamentos (cada salto é revalidado). */
export async function fetchRemoteImage(rawUrl: string): Promise<Buffer> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'https:') throw new Error('Só são aceitos links https');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Endereço da imagem não permitido');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'image/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) throw new Error('Redirecionamento inválido');
      url = new URL(next, url);
      continue;
    }
    if (!response.ok) throw new Error(`Imagem indisponível (${response.status})`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('Imagem acima de 10 MB');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('Imagem acima de 10 MB');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Redirecionamentos demais');
}
