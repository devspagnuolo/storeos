/** Primeiros trechos de endereço que a loja ou o painel já usam: nunca podem ser redirecionados. */
export const RESERVED_ROOTS = ['painel', 'admin', 'api', '_next', 'produto', 'categorias', 'colecoes', 'marcas', 'p', 'busca', 'carrinho', 'checkout', 'conta', 'acompanhar', 'descadastro', 'newsletter', 'recuperar', 'previa', 'robots.txt', 'sitemap.xml', 'icon.svg'];

/** Caminho comparável: sem domínio, sem ?busca e #âncora, minúsculo, com / no início e sem / no fim. */
export function normalizePath(input: string): string {
  let text = input.trim();
  text = text.replace(/^https?:\/\/[^/]+/i, '');
  text = text.split('#')[0].split('?')[0];
  try { text = decodeURIComponent(text); } catch { /* mantém como veio */ }
  text = text.toLowerCase().replace(/\/{2,}/g, '/');
  if (!text.startsWith('/')) text = `/${text}`;
  if (text.length > 1) text = text.replace(/\/+$/, '');
  return text;
}

/** Destino: um caminho da própria loja (/produto/vestido) ou um endereço completo https. Devolve o texto limpo ou o erro. */
export function normalizeTarget(input: string): { ok: true; to: string } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Informe o endereço de destino' };
  if (text.length > 500) return { ok: false, error: 'Endereço de destino muito longo' };
  if (/^https:\/\//i.test(text)) {
    try { new URL(text); } catch { return { ok: false, error: 'Endereço de destino inválido' }; }
    return { ok: true, to: text };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//')) return { ok: false, error: 'O destino deve ser um caminho da loja ou um endereço https' };
  const [path, ...rest] = text.split(/(?=[?#])/);
  const suffix = rest.join('');
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return { ok: true, to: `${cleaned.length > 1 ? cleaned.replace(/\/+$/, '') : cleaned}${suffix}` };
}

export function validateFrom(from: string): string | null {
  if (from === '/') return 'Não é possível redirecionar a página inicial';
  if (from.length > 300) return 'Endereço antigo muito longo';
  const root = from.split('/')[1];
  if (RESERVED_ROOTS.includes(root)) return `“/${root}” já é um endereço da loja e não pode ser redirecionado`;
  return null;
}

/** Segue os redirecionamentos já cadastrados a partir do destino e diz se voltariam ao endereço antigo (ciclo). */
export function wouldLoop(from: string, to: string, existing: ReadonlyMap<string, string>): boolean {
  let current = normalizePath(to);
  for (let hops = 0; hops < 10; hops++) {
    if (current === from) return true;
    const next = existing.get(current);
    if (!next) return false;
    current = normalizePath(next);
  }
  return true;
}

export type CsvRow = { line: number; from: string; to: string };

/** Planilha de duas colunas (antigo,novo) separada por vírgula, ponto e vírgula ou tabulação. Cabeçalho é opcional. */
export function parseRedirectCsv(csv: string): { rows: CsvRow[]; errors: { line: number; error: string }[] } {
  const rows: CsvRow[] = [];
  const errors: { line: number; error: string }[] = [];
  (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv).split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const cells = raw.split(/[;\t,]/).map(cell => cell.trim().replace(/^"|"$/g, ''));
    if (index === 0 && /^(de|antigo|origem|from|url antiga)/i.test(cells[0] ?? '')) return;
    if (cells.length < 2 || !cells[0] || !cells[1]) { errors.push({ line, error: 'Use duas colunas: endereço antigo e endereço novo' }); return; }
    rows.push({ line, from: cells[0], to: cells[1] });
  });
  return { rows, errors };
}

/** Endereços que a Nuvemshop usa e o equivalente na loja nova: produtos em /produtos/{slug} e categorias em /{slug}. */
export function nuvemshopRedirects(products: { slug: string }[], categories: { slug: string }[]) {
  const pairs: { from: string; to: string }[] = products.map(p => ({ from: `/produtos/${p.slug}`, to: `/produto/${p.slug}` }));
  for (const c of categories) {
    const from = `/${c.slug}`;
    if (!validateFrom(from) && c.slug !== 'produtos') pairs.push({ from, to: `/categorias/${c.slug}` });
  }
  return pairs;
}
