/** Vitrine de produtos para Google Shopping, Instagram/Facebook e marketplaces: uma linha por variação (ou por produto sem variações). */
export type FeedProduct = {
  id: string; name: string; slug: string; sku: string; description: string | null; price: string; gtin: string | null;
  brand: string | null; category: string | null; images: string[];
  variants: { sku: string; price: string | null; gtin: string | null; attributes: { name: string; value: string }[]; available: number }[];
  available: number;
};
export type FeedItem = {
  id: string; groupId: string | null; title: string; description: string; link: string; image: string; extraImages: string[];
  availability: 'in stock' | 'out of stock'; price: string; brand: string | null; gtin: string | null; mpn: string; category: string | null;
  color: string | null; size: string | null;
};
export type FeedIssue = 'no-photo' | 'no-gtin' | 'no-brand' | 'no-description';
export const FEED_ISSUE_LABEL: Record<FeedIssue, string> = {
  'no-photo': 'Sem foto (o Google recusa o produto)', 'no-gtin': 'Sem código de barras (GTIN/EAN)', 'no-brand': 'Sem marca', 'no-description': 'Sem descrição',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pick = (attrs: { name: string; value: string }[], names: string[]) => attrs.find(a => names.includes(norm(a.name)))?.value ?? null;
const clean = (text: string) => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function absoluteUrl(site: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${site.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

export function buildFeedItems(products: FeedProduct[], site: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const p of products) {
    const link = `${site.replace(/\/$/, '')}/produto/${p.slug}`;
    const base = {
      title: p.name.slice(0, 150), description: clean(p.description ?? p.name).slice(0, 5000) || p.name, link,
      image: p.images[0] ? absoluteUrl(site, p.images[0]) : '', extraImages: p.images.slice(1, 11).map(u => absoluteUrl(site, u)),
      brand: p.brand, category: p.category,
    };
    if (!p.variants.length) {
      items.push({ ...base, id: p.sku, groupId: null, availability: p.available > 0 ? 'in stock' : 'out of stock', price: Number(p.price).toFixed(2), gtin: p.gtin, mpn: p.sku, color: null, size: null });
      continue;
    }
    for (const v of p.variants) {
      const color = pick(v.attributes, ['cor', 'color']);
      const size = pick(v.attributes, ['tamanho', 'size', 'numero']);
      const label = v.attributes.map(a => a.value).join(' / ');
      items.push({ ...base, title: (label ? `${p.name} - ${label}` : p.name).slice(0, 150), id: v.sku, groupId: p.sku, availability: v.available > 0 ? 'in stock' : 'out of stock', price: Number(v.price ?? p.price).toFixed(2), gtin: v.gtin ?? p.gtin, mpn: v.sku, color, size });
    }
  }
  return items;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS 2.0 com o namespace g: do Google Merchant Center. */
export function buildGoogleXml(items: FeedItem[], store: { name: string; site: string }) {
  const tag = (name: string, value: string | null | undefined) => (value ? `<g:${name}>${xml(value)}</g:${name}>` : '');
  const body = items.filter(i => i.image).map(i => [
    '<item>', tag('id', i.id), `<title>${xml(i.title)}</title>`, `<description>${xml(i.description)}</description>`, `<link>${xml(i.link)}</link>`,
    tag('image_link', i.image), ...i.extraImages.map(u => tag('additional_image_link', u)),
    tag('availability', i.availability), tag('price', `${i.price} BRL`), tag('condition', 'new'), tag('brand', i.brand),
    i.gtin ? tag('gtin', i.gtin) : tag('identifier_exists', 'no'), tag('mpn', i.mpn), tag('item_group_id', i.groupId), tag('google_product_category', 'Apparel & Accessories > Clothing'),
    tag('product_type', i.category), tag('color', i.color), tag('size', i.size), tag('gender', 'female'), tag('age_group', 'adult'), '</item>',
  ].filter(Boolean).join('')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(store.name)}</title><link>${xml(store.site)}</link><description>${xml(`Produtos de ${store.name}`)}</description>${body}</channel></rss>`;
}

const csvCell = (value: string | null) => {
  const text = value ?? '';
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Planilha no formato do catálogo do Meta (Instagram e Facebook). */
export function buildMetaCsv(items: FeedItem[]) {
  const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'gtin', 'mpn', 'item_group_id', 'color', 'size', 'google_product_category', 'product_type', 'additional_image_link'];
  const rows = items.filter(i => i.image).map(i => [i.id, i.title, i.description, i.availability, 'new', `${i.price} BRL`, i.link, i.image, i.brand, i.gtin, i.mpn, i.groupId, i.color, i.size, 'Apparel & Accessories > Clothing', i.category, i.extraImages.join(',')].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n') + '\n';
}

export function feedIssues(p: Pick<FeedProduct, 'images' | 'gtin' | 'brand' | 'description' | 'variants'>): FeedIssue[] {
  const issues: FeedIssue[] = [];
  if (!p.images.length) issues.push('no-photo');
  if (!(p.gtin || (p.variants.length > 0 && p.variants.every(v => v.gtin)))) issues.push('no-gtin');
  if (!p.brand) issues.push('no-brand');
  if (!p.description || clean(p.description).length < 20) issues.push('no-description');
  return issues;
}
