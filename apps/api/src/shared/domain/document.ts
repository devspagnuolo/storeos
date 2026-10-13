/** Validação de CPF/CNPJ (dígitos verificadores). */
function allSame(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 11 || allSame(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 14 || allSame(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidDocument(input: string): boolean {
  const d = input.replace(/\D/g, '');
  return d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false;
}

export function maskDocument(input: string): string {
  const d = input.replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : d.length === 14 ? `**.${d.slice(2, 5)}.***/****-${d.slice(12)}` : '***';
}
