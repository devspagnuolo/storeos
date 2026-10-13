/**
 * Dinheiro em centavos (inteiros). Conversões de/para Decimal do Postgres usam
 * aritmética de strings — nunca ponto flutuante.
 */
export type DecimalLike = { toString(): string };

export function toCents(value: DecimalLike | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  const raw = value.toString().trim();
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ''] = unsigned.split('.');
  const fraction = (fracPart + '00').slice(0, 2);
  const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5 ? 1 : 0;
  const cents = Number(intPart || '0') * 100 + Number(fraction) + roundUp;
  return negative ? -cents : cents;
}

/** Converte centavos em string decimal aceita pelo Prisma (ex.: 12345 → "123.45"). */
export function fromCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Percentual (ex.: 10 = 10%) com arredondamento half-up em centavos. */
export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/** Divide um total proporcionalmente aos pesos, sem perder centavos (maior resto). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}
