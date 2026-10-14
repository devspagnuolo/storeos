import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature } from './webhook-signature';

describe('verifyMercadoPagoSignature', () => {
  const secret = 'segredo-do-webhook';
  const now = 1_760_400_000_000;
  const ts = String(now / 1000);
  const sign = (manifest: string) => createHmac('sha256', secret).update(manifest).digest('hex');

  it('aceita assinatura válida', () => {
    const v1 = sign(`id:123;request-id:req-1;ts:${ts};`);
    expect(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '123', secret, now })).toBe(true);
  });

  it('recusa assinatura adulterada, ausente ou antiga', () => {
    const v1 = sign(`id:123;request-id:req-1;ts:${ts};`);
    expect(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '999', secret, now })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: undefined, dataId: '123', secret, now })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '123', secret, now: now + 3_600_000 })).toBe(false);
  });
});
