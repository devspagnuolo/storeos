/** Leitura de planilhas de produtos (formato de exportação da Nuvemshop e o do próprio StoreOS). Tudo aqui é puro, sem banco. */

export interface ImportVariant { sku: string; attributes: { name: string; value: string }[]; price: number | null; stock: number }
export interface ImportProduct {
  line: number; slug: string; name: string; sku: string; price: number; description?: string; status: 'ACTIVE' | 'DRAFT';
  categories: string[][]; brand?: string; weightGrams?: number; widthCm?: number; heightCm?: number; lengthCm?: number;
  stock: number; seoTitle?: string; seoDescription?: string; imageUrls: string[]; variants: ImportVariant[];
}
export interface ImportError { line: number; message: string }
export interface ParsedProducts { products: ImportProduct[]; errors: ImportError[]; rows: number }

export const MAX_ROWS = 3000;

export const slugify = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const normalizeHeader = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** CSV com ";" "," ou tabulação, aspas duplas, quebras de linha dentro de aspas e BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].map(d => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  slug: ['identificador url', 'slug', 'url'],
  name: ['nome', 'produto', 'name'],
  categories: ['categorias', 'categoria'],
  price: ['preco', 'price'],
  promo: ['preco promocional'],
  weightKg: ['peso kg', 'peso'],
  weightG: ['peso g', 'peso gramas'],
  height: ['altura cm', 'altura'],
  width: ['largura cm', 'largura'],
  length: ['comprimento cm', 'comprimento'],
  stock: ['estoque', 'quantidade', 'stock'],
  sku: ['sku', 'codigo sku'],
  visible: ['exibir na loja', 'status', 'publicado'],
  description: ['descricao', 'description'],
  seoTitle: ['titulo para seo', 'seo titulo'],
  seoDescription: ['descricao para seo', 'seo descricao'],
  brand: ['marca', 'brand'],
  images: ['imagens', 'imagem', 'url da imagem', 'url das imagens', 'imagem principal'],
};

/** "1.234,56", "49,90" e "49.90" viram número; vazio vira undefined. */
export function parseNumber(raw: string | undefined): number | undefined {
  const text = (raw ?? '').replace(/[R$\s]/g, '');
  if (!text) return undefined;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

const intInRange = (raw: string | undefined, min: number, max: number) => {
  const value = parseNumber(raw);
  return value !== undefined && Math.round(value) >= min && Math.round(value) <= max ? Math.round(value) : undefined;
};

/** "Blusas > Regatas, Calças" vira [["Blusas","Regatas"],["Calças"]]; só os dois primeiros níveis valem. */
export const parseCategories = (raw: string | undefined) =>
  (raw ?? '').split(/[,|]/).map(path => path.split('>').map(part => part.trim()).filter(Boolean).slice(0, 2)).filter(path => path.length);

const isVisible = (raw: string | undefined) => !/^(n[aã]o|false|0|rascunho|draft|inativo|oculto)$/i.test((raw ?? '').trim());

export function parseProducts(text: string): ParsedProducts {
  const table = parseCsv(text);
  if (table.length < 2) return { products: [], errors: [{ line: 1, message: 'A planilha está vazia ou sem linhas de produtos' }], rows: 0 };
  const header = table[0].map(normalizeHeader);
  const column = (field: string) => ALIASES[field].map(alias => header.indexOf(alias)).find(index => index >= 0) ?? -1;
  const cols = Object.fromEntries(Object.keys(ALIASES).map(field => [field, column(field)])) as Record<string, number>;
  const attrName = [1, 2, 3].map(n => header.indexOf(`nome da variacao ${n}`));
  const attrValue = [1, 2, 3].map(n => header.indexOf(`valor da variacao ${n}`));
  if (cols.name < 0 && cols.slug < 0) return { products: [], errors: [{ line: 1, message: 'Não encontrei a coluna "Nome" nem "Identificador URL" na planilha' }], rows: 0 };
  const body = table.slice(1);
  if (body.length > MAX_ROWS) return { products: [], errors: [{ line: 1, message: `A planilha tem ${body.length} linhas; o limite é ${MAX_ROWS} por importação` }], rows: body.length };

  const get = (row: string[], field: string) => (cols[field] >= 0 ? (row[cols[field]] ?? '').trim() : '');
  const groups = new Map<string, { line: number; row: string[] }[]>();
  const errors: ImportError[] = [];
  let currentSlug = '';
  body.forEach((row, index) => {
    const line = index + 2;
    const name = get(row, 'name');
    const slug = get(row, 'slug') ? slugify(get(row, 'slug')) : name ? slugify(name) : currentSlug;
    if (!slug) { errors.push({ line, message: 'Linha sem nome nem identificador do produto' }); return; }
    currentSlug = slug;
    groups.set(slug, [...(groups.get(slug) ?? []), { line, row }]);
  });

  const products: ImportProduct[] = [];
  for (const [slug, entries] of groups) {
    const first = entries[0];
    const named = entries.find(e => get(e.row, 'name')) ?? first;
    const name = get(named.row, 'name');
    if (name.length < 2 || name.length > 160) { errors.push({ line: first.line, message: `Nome inválido no produto "${slug}"` }); continue; }
    const priceOf = (row: string[]) => {
      const base = parseNumber(get(row, 'price'));
      const promo = parseNumber(get(row, 'promo'));
      return promo !== undefined && promo > 0 && (base === undefined || promo < base) ? promo : base;
    };
    const variants: ImportVariant[] = [];
    entries.forEach(({ row }, i) => {
      const attributes = [0, 1, 2].flatMap(n => {
        const value = attrValue[n] >= 0 ? (row[attrValue[n]] ?? '').trim() : '';
        const label = attrName[n] >= 0 ? (row[attrName[n]] ?? '').trim() || (entries.find(e => (e.row[attrName[n]] ?? '').trim())?.row[attrName[n]] ?? '').trim() : '';
        return value ? [{ name: label || `Opção ${n + 1}`, value }] : [];
      });
      if (!attributes.length) return;
      variants.push({
        sku: get(row, 'sku') || `${slug}-${i + 1}`.toUpperCase().slice(0, 64), attributes,
        price: priceOf(row) ?? null, stock: Math.max(Math.round(parseNumber(get(row, 'stock')) ?? 0), 0),
      });
    });
    const prices = variants.length ? variants.map(v => v.price).filter((p): p is number => p !== null) : [priceOf(named.row)].filter((p): p is number => p !== undefined);
    if (!prices.length) { errors.push({ line: first.line, message: `Produto "${name}" sem preço` }); continue; }
    const price = Math.min(...prices);
    if (price < 0) { errors.push({ line: first.line, message: `Produto "${name}" com preço negativo` }); continue; }
    if (variants.length > 100) { errors.push({ line: first.line, message: `Produto "${name}" tem mais de 100 variações` }); continue; }
    const names = new Set(variants.map(v => v.attributes.map(a => a.name.toLowerCase()).join('|')));
    if (names.size > 1) { errors.push({ line: first.line, message: `Produto "${name}": as variações usam atributos diferentes` }); continue; }
    const combos = variants.map(v => v.attributes.map(a => a.value.toLowerCase()).join('|'));
    if (new Set(combos).size !== combos.length) { errors.push({ line: first.line, message: `Produto "${name}" tem variações repetidas` }); continue; }
    const skus = variants.map(v => v.sku.toLowerCase());
    if (new Set(skus).size !== skus.length) { errors.push({ line: first.line, message: `Produto "${name}" tem SKUs repetidos nas variações` }); continue; }

    const weightKg = parseNumber(get(named.row, 'weightKg'));
    const grams = cols.weightG >= 0 ? intInRange(get(named.row, 'weightG'), 1, 100_000) : weightKg !== undefined ? intInRange(String(Math.round(weightKg * 1000)), 1, 100_000) : undefined;
    const description = get(named.row, 'description');
    products.push({
      line: first.line, slug, name, price, status: isVisible(get(named.row, 'visible')) ? 'ACTIVE' : 'DRAFT',
      sku: (get(named.row, 'sku') && !variants.length ? get(named.row, 'sku') : slug.toUpperCase()).slice(0, 60),
      ...(description && { description: description.slice(0, 5000) }),
      categories: parseCategories(get(named.row, 'categories')),
      ...(get(named.row, 'brand') && { brand: get(named.row, 'brand').slice(0, 80) }),
      ...(grams && { weightGrams: grams }),
      ...(intInRange(get(named.row, 'width'), 1, 300) && { widthCm: intInRange(get(named.row, 'width'), 1, 300) }),
      ...(intInRange(get(named.row, 'height'), 1, 300) && { heightCm: intInRange(get(named.row, 'height'), 1, 300) }),
      ...(intInRange(get(named.row, 'length'), 1, 300) && { lengthCm: intInRange(get(named.row, 'length'), 1, 300) }),
      stock: variants.length ? 0 : Math.min(Math.max(Math.round(parseNumber(get(named.row, 'stock')) ?? 0), 0), 1_000_000),
      ...(get(named.row, 'seoTitle') && { seoTitle: get(named.row, 'seoTitle').slice(0, 70) }),
      ...(get(named.row, 'seoDescription') && { seoDescription: get(named.row, 'seoDescription').slice(0, 160) }),
      imageUrls: [...new Set(entries.flatMap(e => get(e.row, 'images').split(/[\s,|]+/).filter(url => /^https?:\/\/\S+$/.test(url))))].slice(0, 10),
      variants,
    });
  }
  return { products, errors, rows: body.length };
}
