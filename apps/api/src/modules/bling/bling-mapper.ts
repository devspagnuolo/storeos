/** Conversões entre o Bling (API v3) e o StoreOS. Tudo aqui é puro: sem rede nem banco. */
import { normalizeCest, normalizeGtin, normalizeNcm, normalizeOrigin, normalizeUnit } from '../catalog/fiscal-rules';
import { ImportProduct, ImportVariant, slugify } from '../catalog/product-csv';

export type BlingMedia = { imagens?: { externas?: { link?: string }[]; internas?: { link?: string }[] } };

export type BlingProductDetail = {
  id: number; nome: string; codigo?: string; preco?: number; situacao?: string; formato?: string;
  descricaoCurta?: string; descricaoComplementar?: string; marca?: string;
  pesoBruto?: number; pesoLiquido?: number; largura?: number; altura?: number; profundidade?: number;
  categoria?: { id?: number };
  gtin?: string; gtinEmbalagem?: string; unidade?: string;
  tributacao?: { ncm?: string; cest?: string; origem?: number | string };
  estoque?: { saldoVirtualTotal?: number };
  midia?: BlingMedia;
  variacoes?: { id: number; nome?: string; codigo?: string; preco?: number; gtin?: string; variacao?: { nome?: string }; estoque?: { saldoVirtualTotal?: number }; midia?: BlingMedia }[];
  seo?: { title?: string; description?: string };
};
/** Código mínimo padrão para importar produtos do Bling. */
export const DEFAULT_PRODUCT_CODE_FROM = 1500;

/** Número do código (SKU) do cadastro: os dígitos do início ("2456" ou "2456-P" viram 2456); null se não começa com número. */
export function productCodeNumber(code?: string | null) {
  const digits = /^\s*(\d+)/.exec(code ?? '')?.[1];
  const value = digits ? Number(digits) : NaN;
  return Number.isSafeInteger(value) ? value : null;
}

/** Só entra na importação o produto cujo código é a partir do mínimo da loja. */
export const meetsCodeFrom = (code: string | null | undefined, from: number) => {
  const value = productCodeNumber(code);
  return value !== null && value >= from;
};

/** 1500, 1501, 1502…; empate no número (ex.: 1500 e 1500-A) desempata pelo texto do código. */
export const byCode = (a: { codigo?: string }, b: { codigo?: string }) =>
  (productCodeNumber(a.codigo) ?? Infinity) - (productCodeNumber(b.codigo) ?? Infinity) || (a.codigo ?? '').trim().localeCompare((b.codigo ?? '').trim(), 'pt-BR', { numeric: true });

export type BlingCategory = { id: number; descricao: string; categoriaPai?: { id?: number } };

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ccedil;': 'ç', '&atilde;': 'ã', '&otilde;': 'õ' };

/** Descrições do Bling vêm em HTML; a loja guarda texto simples com quebras de linha. */
export function blingText(html?: string | null) {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, entity => ENTITIES[entity.toLowerCase()] ?? '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "Cor:Azul;Tamanho:M" vira [{Cor, Azul}, {Tamanho, M}]; sem rótulo, o valor entra como "Opção". */
export function parseVariation(label?: string): { name: string; value: string }[] {
  if (!label) return [];
  return label.split(';').map(part => part.trim()).filter(Boolean).slice(0, 3).map(part => {
    const [name, ...value] = part.includes(':') ? part.split(':') : ['Opção', part];
    return { name: name.trim().slice(0, 40) || 'Opção', value: value.join(':').trim().slice(0, 60) };
  }).filter(attribute => attribute.value);
}

/** Caminho "Blusas > Manga Longa" de uma categoria do Bling, subindo pelos pais (com trava contra ciclos). */
export function categoryPath(id: number | undefined, categories: Map<number, BlingCategory>): string[] {
  const path: string[] = [];
  const seen = new Set<number>();
  for (let current = id ? categories.get(id) : undefined; current && !seen.has(current.id); current = current.categoriaPai?.id ? categories.get(current.categoriaPai.id) : undefined) {
    seen.add(current.id);
    path.unshift(current.descricao.trim());
    if (path.length >= 4) break;
  }
  return path.filter(Boolean);
}

const money = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100) / 100);
const units = (value: unknown) => Math.max(0, Math.floor(Number(value ?? 0)));
const links = (detail: { midia?: BlingMedia }) => [...new Set([...(detail.midia?.imagens?.externas ?? []), ...(detail.midia?.imagens?.internas ?? [])].map(i => i.link ?? '').filter(url => /^https:\/\/\S+$/.test(url)))].slice(0, 10);

/** NCM, CEST, origem, GTIN e unidade do cadastro; o que vier fora do formato é ignorado (a nota é conferida no Bling). */
function fiscalOf(detail: BlingProductDetail) {
  const ncm = normalizeNcm(detail.tributacao?.ncm);
  const cest = normalizeCest(detail.tributacao?.cest);
  const taxOrigin = normalizeOrigin(detail.tributacao?.origem);
  const gtin = normalizeGtin(detail.gtin) ?? normalizeGtin(detail.gtinEmbalagem);
  const unit = normalizeUnit(detail.unidade);
  return { ...(ncm && { ncm }), ...(cest && { cest }), ...(taxOrigin !== undefined && { taxOrigin }), ...(gtin && { gtin }), ...(unit && { unit }) };
}

type RawVariant = { sku: string; label?: string; name?: string; gtin?: string; price: number | null; stock: number };

/**
 * Variações do Bling num formato que a loja aceita: todas com os mesmos atributos e sem combinações repetidas.
 * Sem rótulo ("Cor:Azul;Tamanho:M"), o valor sai do nome da variação sem o nome do produto, ou do próprio código.
 */
export function normalizeVariants(parentName: string, raw: RawVariant[]): ImportVariant[] {
  const parsed = raw.map(v => {
    let attributes = parseVariation(v.label);
    if (!attributes.length) {
      const fromName = (v.name ?? '').replace(parentName ?? '', '').replace(/^[\s\-–:/]+|[\s\-–:/]+$/g, '').trim();
      attributes = [{ name: 'Opção', value: (fromName || v.sku).slice(0, 60) }];
    }
    return { ...v, attributes };
  });
  const shape = (v: { attributes: { name: string }[] }) => v.attributes.map(a => a.name.toLowerCase()).join('|');
  if (new Set(parsed.map(shape)).size > 1) for (const v of parsed) v.attributes = [{ name: 'Opção', value: v.attributes.map(a => a.value).join(' / ').slice(0, 60) }];
  const seen = new Set<string>();
  return parsed.map(v => {
    const key = v.attributes.map(a => a.value.toLowerCase()).join('|');
    if (seen.has(key)) v.attributes = [...v.attributes.slice(0, -1), { ...v.attributes.at(-1)!, value: `${v.attributes.at(-1)!.value} (${v.sku})`.slice(0, 60) }];
    seen.add(v.attributes.map(a => a.value.toLowerCase()).join('|'));
    return { sku: v.sku, attributes: v.attributes, price: v.price, stock: v.stock, ...(v.gtin && { gtin: v.gtin }) };
  });
}

/** Atributo que representa a cor da peça ("Cor", "Cores", "Color"). */
export const isColorAttribute = (name: string) => /^(cor|cores|colou?r)$/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());

/** Fotos de cada cor: as da primeira variação daquela cor que tem foto no Bling (tamanhos da mesma cor repetem a foto). */
export function colorImages(detail: BlingProductDetail, variants: ImportVariant[]) {
  const index = variants[0]?.attributes.findIndex(a => isColorAttribute(a.name)) ?? -1;
  if (index < 0) return [];
  const byColor = new Map<string, string[]>();
  for (const raw of detail.variacoes ?? []) {
    const color = variants.find(v => v.sku.toLowerCase() === raw.codigo?.trim().toLowerCase())?.attributes[index]?.value;
    const urls = links(raw);
    if (color && urls.length && !byColor.has(color.toLowerCase())) byColor.set(color.toLowerCase(), urls);
  }
  return [...byColor].map(([key, urls]) => ({ color: variants.flatMap(v => v.attributes[index]?.value ?? []).find(c => c.toLowerCase() === key)!, urls }));
}

/** Produto do Bling no formato que o importador do catálogo já entende. `takenSlug` evita colisão com outro SKU. */
export function toImportProduct(detail: BlingProductDetail, categories: Map<number, BlingCategory>, line: number, takenSlug: (slug: string) => boolean = () => false): ImportProduct | { error: string } {
  const name = detail.nome?.trim();
  const sku = detail.codigo?.trim();
  if (!name) return { error: `Produto ${detail.id} sem nome` };
  if (!sku) return { error: `${name}: sem código (SKU) no Bling` };
  let slug = slugify(name) || slugify(sku);
  if (takenSlug(slug)) slug = `${slug}-${slugify(sku)}`.slice(0, 160);
  const variants = normalizeVariants(detail.nome, (detail.variacoes ?? []).filter(v => v.codigo?.trim()).map(v => ({
    sku: v.codigo!.trim(), label: v.variacao?.nome, name: v.nome, gtin: normalizeGtin(v.gtin), price: v.preco !== undefined && money(v.preco) !== money(detail.preco) ? money(v.preco) : null, stock: units(v.estoque?.saldoVirtualTotal),
  })));
  const path = categoryPath(detail.categoria?.id, categories);
  const description = [blingText(detail.descricaoComplementar), blingText(detail.descricaoCurta)].find(Boolean);
  const grams = detail.pesoBruto || detail.pesoLiquido;
  return {
    line, slug, name: name.slice(0, 160), sku: sku.slice(0, 60), price: money(detail.preco), status: detail.situacao === 'A' ? 'ACTIVE' : 'DRAFT',
    ...(description && { description: description.slice(0, 5000) }),
    categories: path.length ? [path] : [], ...(detail.marca?.trim() && { brand: detail.marca.trim().slice(0, 80) }),
    ...(grams && { weightGrams: Math.max(1, Math.min(100_000, Math.round(grams * 1000))) }),
    ...(detail.largura && { widthCm: Math.max(1, Math.min(300, Math.round(detail.largura))) }),
    ...(detail.altura && { heightCm: Math.max(1, Math.min(300, Math.round(detail.altura))) }),
    ...(detail.profundidade && { lengthCm: Math.max(1, Math.min(300, Math.round(detail.profundidade))) }),
    stock: units(detail.estoque?.saldoVirtualTotal),
    ...(detail.seo?.title && { seoTitle: detail.seo.title.slice(0, 70) }), ...(detail.seo?.description && { seoDescription: detail.seo.description.slice(0, 160) }),
    imageUrls: links(detail), variants, colorImages: colorImages(detail, variants),
    ...fiscalOf(detail),
  };
}

export type OrderForBling = {
  number: string; createdAt: Date; subtotal: number; discount: number; promotionDiscount: number; shipping: number; total: number; shippingMethod: string | null; couponCode: string | null;
  paymentMethod: string | null; address: { zipCode?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string } | null;
  customer: { name: string; email: string; document: string | null; phone: string | null };
  items: { sku: string; name: string; quantity: number; unitPrice: number }[];
};

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const PAYMENT_LABEL: Record<string, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito' };

export function contactPayload(order: OrderForBling) {
  const document = order.customer.document?.replace(/\D/g, '') ?? '';
  const address = order.address;
  return {
    nome: order.customer.name.slice(0, 120), situacao: 'A', tipo: document.length === 14 ? 'J' : 'F', ...(document && { numeroDocumento: document }), email: order.customer.email,
    ...(order.customer.phone && { celular: order.customer.phone }),
    ...(address && { endereco: { geral: { endereco: address.street, numero: address.number, complemento: address.complement ?? '', bairro: address.district ?? '', cep: address.zipCode?.replace(/\D/g, ''), municipio: address.city, uf: address.state } } }),
  };
}

/** Ids da conta Bling usados no financeiro do pedido (categoria "Venda de Mercadoria" e forma de pagamento), quando encontrados. */
export type SalesOrderFinance = { categoryId?: number; paymentFormId?: number };

/** Corpo de POST /pedidos/vendas. `productIds` mapeia SKU → id do produto no Bling, quando existe. */
export function salesOrderPayload(order: OrderForBling, contactId: number, productIds: Map<string, number>, finance: SalesOrderFinance = {}) {
  const discount = Math.round((order.discount + order.promotionDiscount) * 100) / 100;
  const address = order.address;
  const payment = order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod : undefined;
  return {
    numeroLoja: order.number,
    data: ymd(order.createdAt),
    contato: { id: contactId },
    itens: order.items.map(item => ({
      ...(productIds.has(item.sku.toLowerCase()) && { produto: { id: productIds.get(item.sku.toLowerCase()) } }),
      codigo: item.sku, descricao: item.name.slice(0, 120), unidade: 'UN', quantidade: item.quantity, valor: item.unitPrice,
    })),
    ...(discount > 0 && { desconto: { valor: discount, unidade: 'REAL' } }),
    transporte: {
      fretePorConta: 0, frete: order.shipping,
      ...(address && { etiqueta: { nome: order.customer.name.slice(0, 60), endereco: address.street, numero: address.number, complemento: address.complement ?? '', municipio: address.city, uf: address.state, cep: address.zipCode?.replace(/\D/g, ''), bairro: address.district ?? '' } }),
    },
    ...(finance.categoryId && { categoria: { id: finance.categoryId } }),
    // O pagamento já foi aprovado na loja: uma parcela com o total, para a conta a receber nascer certa.
    ...(finance.paymentFormId && { parcelas: [{ dataVencimento: ymd(order.createdAt), valor: order.total, observacoes: payment ?? '', formaPagamento: { id: finance.paymentFormId } }] }),
    observacoes: [`Pedido ${order.number} da loja virtual.`, order.shippingMethod && `Frete: ${order.shippingMethod}.`, payment && `Pagamento: ${payment}.`, order.couponCode && `Cupom: ${order.couponCode}.`].filter(Boolean).join(' '),
  };
}

/** Escolhe a forma de pagamento do Bling que corresponde ao meio usado na loja (pela descrição). */
export function matchPaymentForm(forms: { id: number; descricao?: string }[], method: string | null): number | undefined {
  const words: Record<string, RegExp> = { PIX: /pix/i, BOLETO: /boleto/i, CREDIT_CARD: /cr[eé]dito|cart[aã]o/i };
  const pattern = method ? words[method] : undefined;
  return pattern ? forms.find(form => pattern.test(form.descricao ?? ''))?.id : undefined;
}

/** Categoria financeira pelo nome (sem diferenciar maiúsculas e acentos). */
export function matchCategory(categories: { id: number; descricao?: string }[], name: string): number | undefined {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return categories.find(category => normalize(category.descricao ?? '') === normalize(name))?.id;
}
