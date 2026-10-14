import { BadRequestException } from '@nestjs/common';

export const MAX_RANGE_DAYS = 366;
/** A loja opera no horário de Brasília (UTC-3, sem horário de verão). */
export const BRT_OFFSET_MS = 3 * 3_600_000;
export const brtDay = (instant: Date) => new Date(instant.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);

/** Período [from, to) em dias corridos de Brasília. Padrão: últimos 30 dias, incluindo hoje. */
export function resolveRange(from?: string, to?: string, now = new Date()) {
  const midnight = (day: string) => new Date(new Date(`${day}T00:00:00.000Z`).getTime() + BRT_OFFSET_MS);
  const end = to ? midnight(to) : new Date(midnight(brtDay(now)).getTime() + 86_400_000);
  const start = from ? midnight(from) : new Date(end.getTime() - 30 * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Datas inválidas (use AAAA-MM-DD)');
  if (start >= end) throw new BadRequestException('A data inicial precisa ser anterior à final');
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) throw new BadRequestException(`O período máximo é de ${MAX_RANGE_DAYS} dias`);
  return { start, end };
}
