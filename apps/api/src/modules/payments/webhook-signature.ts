import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida o header x-signature do Mercado Pago ("ts=...,v1=...").
 * O manifesto assinado é "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function verifyMercadoPagoSignature(input: { signature?: string; requestId?: string; dataId?: string; secret: string; now?: number; toleranceSeconds?: number }) {
  if (!input.signature || !input.dataId) return false;
  const parts = Object.fromEntries(input.signature.split(',').map(part => part.trim().split('=', 2) as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const tolerance = input.toleranceSeconds ?? 600;
  const tsSeconds = Number(ts) > 1e12 ? Number(ts) / 1000 : Number(ts);
  if (Math.abs((input.now ?? Date.now()) / 1000 - tsSeconds) > tolerance) return false;
  let manifest = `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest('hex');
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
