export type TimelineEvent = { at: Date; kind: 'ORDER' | 'EMAIL' | 'CART' | 'LOYALTY' | 'COUPON' | 'NOTE' | 'SIGNUP'; title: string; detail?: string; ref?: string };

/** Junta eventos de várias fontes numa única linha do tempo, do mais recente ao mais antigo. */
export function buildTimeline(events: TimelineEvent[], limit = 100): TimelineEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Média de dias entre compras consecutivas; null com menos de 2 compras. */
export function averageDaysBetween(dates: Date[]): number | null {
  if (dates.length < 2) return null;
  const sorted = dates.map(d => d.getTime()).sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((t, i) => (t - sorted[i]) / 86_400_000);
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

export function daysSince(date: Date | null | undefined, now = new Date()): number | null {
  return date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000)) : null;
}

export function normalizeTag(tag: string): string { return tag.trim().toLowerCase().slice(0, 30); }

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; // evita fórmula ao abrir no Excel
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(rows: unknown[][]): string { return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }
