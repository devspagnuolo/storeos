'use client';
import { useState } from 'react';

/** QR code e código copia e cola do PIX, quando o gateway devolve esses dados. */
export function PixPayment({ pixCode, qrCodeBase64, expiresAt }: { pixCode: string; qrCodeBase64?: string; expiresAt?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-slate-200 p-6 text-center">
      {qrCodeBase64 && <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR code do PIX" className="h-56 w-56" />}
      <label className="w-full text-left text-sm font-medium">PIX copia e cola
        <textarea readOnly value={pixCode} rows={3} className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs" />
      </label>
      <button type="button" className="button" onClick={copy}>{copied ? 'Código copiado!' : 'Copiar código PIX'}</button>
      {expiresAt && <p className="text-xs text-slate-500">Válido até {new Date(expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Depois disso o pedido é cancelado.</p>}
    </div>
  );
}
