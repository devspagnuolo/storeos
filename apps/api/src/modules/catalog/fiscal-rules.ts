/** Dados fiscais do produto. Tudo puro: o Bling manda NCM como "6109.10.00", GTIN como texto etc. */
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const normalizeNcm = (value: unknown): string | undefined => { const d = digits(value); return d.length === 8 && d !== '00000000' ? d : undefined; };
export const normalizeCest = (value: unknown): string | undefined => { const d = digits(value); return d.length === 7 ? d : undefined; };
export const formatNcm = (ncm?: string | null) => (ncm && ncm.length === 8 ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm ?? '');

/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function gtinChecksumOk(code: string): boolean {
  const nums = code.split('').map(Number);
  const check = nums.pop() as number;
  const sum = nums.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
export function normalizeGtin(value: unknown): string | undefined {
  const d = digits(value);
  return [8, 12, 13, 14].includes(d.length) && /[1-9]/.test(d) && gtinChecksumOk(d) ? d : undefined;
}

export function normalizeOrigin(value: unknown): number | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const n = typeof value === 'number' ? value : Number(text);
  return Number.isInteger(n) && n >= 0 && n <= 8 ? n : undefined;
}
export const normalizeUnit = (value: unknown): string | undefined => { const t = String(value ?? '').trim().toUpperCase().slice(0, 6); return t || undefined; };

export const ORIGIN_LABEL: Record<number, string> = {
  0: 'Nacional', 1: 'Estrangeira (importação direta)', 2: 'Estrangeira (adquirida no mercado interno)', 3: 'Nacional (importação entre 40% e 70%)',
  4: 'Nacional (processos produtivos básicos)', 5: 'Nacional (importação até 40%)', 6: 'Estrangeira (importação direta, sem similar)', 7: 'Estrangeira (mercado interno, sem similar)', 8: 'Nacional (importação acima de 70%)',
};

type FiscalInput = { ncm?: string | null; cest?: string | null; gtin?: string | null; unit?: string | null };
/** Limpa NCM/CEST/GTIN/unidade vindos da API: null apaga, ausente não mexe, GTIN com dígito verificador errado é recusado. */
export function cleanFiscal<T extends FiscalInput>(dto: T): T {
  const out: FiscalInput = {};
  if (dto.ncm !== undefined) out.ncm = dto.ncm === null ? null : normalizeNcm(dto.ncm) ?? (() => { throw new Error('NCM inválido'); })();
  if (dto.cest !== undefined) out.cest = dto.cest === null ? null : normalizeCest(dto.cest) ?? (() => { throw new Error('CEST inválido'); })();
  if (dto.gtin !== undefined) out.gtin = dto.gtin === null ? null : normalizeGtin(dto.gtin) ?? (() => { throw new Error('GTIN/EAN inválido (confira o dígito verificador)'); })();
  if (dto.unit !== undefined) out.unit = dto.unit === null ? null : normalizeUnit(dto.unit) ?? null;
  return { ...dto, ...out };
}
