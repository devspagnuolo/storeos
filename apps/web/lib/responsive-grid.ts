/**
 * Classes fixas (o Tailwind só gera o que aparece escrito no código) para as colunas escolhidas no tema:
 * uma quantidade no celular e outra a partir do computador; o tablet fica no meio-termo.
 */
const MOBILE: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };
const TABLET: Record<number, string> = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };
const DESKTOP: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' };

export function gridColumns(mobile: number | undefined, desktop: number | undefined, defaults: { mobile: number; desktop: number }) {
  const small = MOBILE[mobile ?? defaults.mobile] ?? MOBILE[defaults.mobile];
  const large = desktop ?? defaults.desktop;
  const middle = Math.max(2, Math.min(4, Math.ceil((Math.max(mobile ?? defaults.mobile, 2) + large) / 2)));
  return `${small} ${TABLET[middle]} ${DESKTOP[large] ?? DESKTOP[defaults.desktop]}`;
}

/** "Mostrar em": seção só no computador, só no celular ou nos dois. */
export function visibilityClass(value: unknown) {
  if (value === 'desktop') return 'hidden md:block';
  if (value === 'mobile') return 'md:hidden';
  return '';
}
