const CORREIOS = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Código de rastreio aceito: curto, sem espaços ou símbolos (evita texto livre e injeção em e-mails e links). */
export function cleanTrackingCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9-]{5,40}$/.test(code) ? code : null;
}

const httpsUrl = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  try { return new URL(raw).protocol === 'https:' ? raw : null; } catch { return null; }
};

/** Link de acompanhamento: o informado (só https) ou um padrão pelo código (Correios ou agregador). */
export function trackingLink(code: string | null | undefined, custom?: unknown): string | null {
  const own = httpsUrl(custom);
  if (own) return own;
  const clean = cleanTrackingCode(code);
  if (!clean) return null;
  return CORREIOS.test(clean) ? `https://rastreamento.correios.com.br/app/index.php?objetos=${clean}` : `https://www.melhorrastreio.com.br/rastreio/${clean}`;
}

type Volume = { servico?: unknown; codigoRastreamento?: unknown };
export type BlingTracking = { code: string; carrier: string | null };

/** Lê o rastreio de um pedido de venda do Bling; aceita volumes ou campo direto no transporte e ignora o resto. */
export function extractBlingTracking(order: unknown): BlingTracking | null {
  const root = (order as { data?: unknown } | null)?.data ?? order;
  const transport = (root as { transporte?: { volumes?: Volume[]; codigoRastreamento?: unknown; transportador?: { nome?: unknown } } } | null)?.transporte;
  if (!transport) return null;
  const candidates = [...(Array.isArray(transport.volumes) ? transport.volumes : []).map(v => ({ code: v?.codigoRastreamento, carrier: v?.servico })), { code: transport.codigoRastreamento, carrier: transport.transportador?.nome }];
  for (const candidate of candidates) {
    const code = cleanTrackingCode(candidate.code);
    if (code) return { code, carrier: typeof candidate.carrier === 'string' && candidate.carrier.trim() ? candidate.carrier.trim().slice(0, 80) : null };
  }
  return null;
}

const LABEL: Record<string, string> = {
  NEW: 'Pedido recebido', AWAITING_PAYMENT: 'Aguardando pagamento', PAID: 'Pagamento confirmado', PICKING: 'Em separação', INVOICED: 'Nota fiscal emitida',
  SHIPPED: 'Enviado', DELIVERED: 'Entregue', CANCELLED: 'Cancelado', RETURNED: 'Devolvido', REFUNDED: 'Reembolsado',
};
export const statusLabel = (status: string) => LABEL[status] ?? status;
