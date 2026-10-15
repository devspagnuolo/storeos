import type { HomeSection, SectionProps, SectionType, StorefrontConfig } from './api';

export type FieldSpec =
  | { key: string; label: string; kind: 'text' | 'textarea' | 'url'; max: number; placeholder?: string; help?: string }
  | { key: string; label: string; kind: 'number'; min: number; max: number }
  | { key: string; label: string; kind: 'select'; options: [string, string][] }
  | { key: string; label: string; kind: 'image'; help?: string }
  | { key: string; label: string; kind: 'products'; max: number; help?: string }
  | { key: string; label: string; kind: 'list'; itemLabel: string; max: number; fields: FieldSpec[]; defaults: SectionProps };

export const SECTION_CATALOG: Record<SectionType, { label: string; description: string; fields: FieldSpec[]; defaults: SectionProps }> = {
  banners: { label: 'Banners rotativos', description: 'Carrossel com os banners cadastrados em Banners.', fields: [], defaults: {} },
  hero: {
    label: 'Destaque principal', description: 'Título, texto, botão e imagem.',
    fields: [
      { key: 'title', label: 'Título', kind: 'text', max: 120 }, { key: 'description', label: 'Texto de apoio', kind: 'textarea', max: 300 },
      { key: 'cta', label: 'Texto do botão', kind: 'text', max: 40 }, { key: 'ctaHref', label: 'Link do botão', kind: 'url', max: 500, placeholder: '/categorias' },
      { key: 'layout', label: 'Layout', kind: 'select', options: [['split', 'Texto e imagem lado a lado'], ['centered', 'Centralizado'], ['overlay', 'Texto sobre a imagem']] },
      { key: 'imageUrl', label: 'Imagem', kind: 'image' }, { key: 'imageAlt', label: 'Descrição da imagem (acessibilidade)', kind: 'text', max: 140 },
    ],
    defaults: { layout: 'split', title: 'Nova coleção', description: 'Conheça as novidades da loja.', cta: 'Ver produtos', ctaHref: '/categorias', imageUrl: null, imageAlt: '' },
  },
  image: {
    label: 'Imagem', description: 'Uma imagem em largura total, com link opcional.',
    fields: [
      { key: 'imageUrl', label: 'Imagem', kind: 'image' }, { key: 'mobileImageUrl', label: 'Imagem para celular (opcional)', kind: 'image' },
      { key: 'alt', label: 'Descrição da imagem (acessibilidade)', kind: 'text', max: 140 }, { key: 'href', label: 'Link ao clicar', kind: 'url', max: 500, placeholder: '/categorias/blusas' },
    ],
    defaults: { imageUrl: null, mobileImageUrl: null, alt: '', href: null },
  },
  carousel: {
    label: 'Carrossel de imagens', description: 'Várias imagens que passam sozinhas.',
    fields: [{ key: 'slides', label: 'Imagens', kind: 'list', itemLabel: 'Imagem', max: 10, defaults: { imageUrl: null, alt: '', href: null }, fields: [
      { key: 'imageUrl', label: 'Imagem', kind: 'image' }, { key: 'alt', label: 'Descrição (acessibilidade)', kind: 'text', max: 140 }, { key: 'href', label: 'Link', kind: 'url', max: 500 },
    ] }],
    defaults: { slides: [], autoplay: true },
  },
  text: {
    label: 'Texto', description: 'Título e parágrafo (texto simples).',
    fields: [{ key: 'heading', label: 'Título', kind: 'text', max: 120 }, { key: 'body', label: 'Texto', kind: 'textarea', max: 2000 }, { key: 'align', label: 'Alinhamento', kind: 'select', options: [['left', 'À esquerda'], ['center', 'Centralizado']] }],
    defaults: { heading: 'Sobre a loja', body: 'Conte aqui a história da sua marca.', align: 'left' },
  },
  categories: {
    label: 'Categorias', description: 'Grade com as categorias principais.',
    fields: [{ key: 'heading', label: 'Título', kind: 'text', max: 80 }, { key: 'limit', label: 'Quantidade (1 a 12)', kind: 'number', min: 1, max: 12 }, { key: 'layout', label: 'Estilo', kind: 'select', options: [['cards', 'Cartões'], ['circles', 'Círculos']] }],
    defaults: { heading: 'Compre por categoria', limit: 6, layout: 'cards' },
  },
  products: {
    label: 'Produtos', description: 'Vitrine de produtos, de toda a loja ou de uma categoria.',
    fields: [
      { key: 'subheading', label: 'Subtítulo', kind: 'text', max: 80 }, { key: 'heading', label: 'Título', kind: 'text', max: 80 },
      { key: 'productIds', label: 'Produtos escolhidos', kind: 'products', max: 24, help: 'Escolha entre os produtos já cadastrados. Com produtos escolhidos, a categoria e a quantidade abaixo são ignoradas.' },
      { key: 'categorySlug', label: 'Categoria (código da URL, opcional)', kind: 'text', max: 120, placeholder: 'blusas', help: 'Deixe vazio para mostrar os produtos mais recentes.' },
      { key: 'limit', label: 'Quantidade (1 a 24)', kind: 'number', min: 1, max: 24 },
      { key: 'columns', label: 'Colunas no computador', kind: 'select', options: [['3', '3 colunas'], ['4', '4 colunas'], ['5', '5 colunas']] },
    ],
    defaults: { columns: '4', subheading: 'CURADORIA', heading: 'Mais desejados', categorySlug: '', limit: 8, productIds: [] },
  },
  benefits: {
    label: 'Benefícios', description: 'Até 6 destaques curtos (frete, pagamento…).',
    fields: [{ key: 'items', label: 'Benefícios', kind: 'list', itemLabel: 'Benefício', max: 6, defaults: { title: 'Novo benefício', text: '' }, fields: [{ key: 'title', label: 'Título', kind: 'text', max: 60 }, { key: 'text', label: 'Texto', kind: 'text', max: 140 }] }],
    defaults: { items: [{ title: 'Entrega para todo o Brasil', text: 'Prazo e valor calculados pelo seu CEP.' }, { title: 'Pagamento protegido', text: 'Pague com segurança.' }, { title: 'Compra sem cadastro', text: 'Finalize só com seus dados de entrega.' }] },
  },
  testimonials: {
    label: 'Depoimentos', description: 'Até 6 opiniões de clientes.',
    fields: [{ key: 'heading', label: 'Título', kind: 'text', max: 80 }, { key: 'items', label: 'Depoimentos', kind: 'list', itemLabel: 'Depoimento', max: 6, defaults: { name: 'Cliente', text: '' }, fields: [{ key: 'name', label: 'Nome', kind: 'text', max: 60 }, { key: 'text', label: 'Depoimento', kind: 'textarea', max: 300 }] }],
    defaults: { heading: 'Quem comprou, recomenda', items: [{ name: 'Cliente', text: 'Escreva aqui o depoimento de uma cliente real.' }] },
  },
  newsletter: {
    label: 'Newsletter', description: 'Captura de e-mails (lista em Newsletter).',
    fields: [{ key: 'heading', label: 'Título', kind: 'text', max: 80 }, { key: 'text', label: 'Texto', kind: 'text', max: 200 }],
    defaults: { heading: 'Receba novidades', text: 'Ofertas e lançamentos em primeira mão.' },
  },
  video: {
    label: 'Vídeo', description: 'Vídeo do YouTube ou do Vimeo.',
    fields: [{ key: 'url', label: 'Link do vídeo', kind: 'url', max: 300, placeholder: 'https://www.youtube.com/watch?v=…', help: 'Só YouTube e Vimeo.' }, { key: 'title', label: 'Título do vídeo (acessibilidade)', kind: 'text', max: 120 }],
    defaults: { url: '', title: '' },
  },
};

export const newSectionId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;
export const newSection = (type: SectionType): HomeSection => ({ id: newSectionId(type), type, hidden: false, props: structuredClone(SECTION_CATALOG[type].defaults) });

/** Layout atual da loja quando o lojista ainda não montou o próprio: banners (ou destaque), produtos e benefícios. */
export function defaultHomeSections(theme: StorefrontConfig, hasBanners: boolean): HomeSection[] {
  const hero: HomeSection = { id: 'hero', type: 'hero', hidden: false, props: {
    title: theme.heroTitle ?? 'Sua marca merece uma experiência memorável.',
    description: theme.heroDescription ?? 'Produtos extraordinários, entrega confiável e uma jornada simples do primeiro clique ao pós-venda.',
    cta: theme.heroCta ?? 'Explorar coleção', ctaHref: '/categorias', imageUrl: theme.heroImageUrl ?? null, imageAlt: '',
  } };
  const banners: HomeSection = { id: 'banners', type: 'banners', hidden: false, props: {} };
  return [hasBanners ? banners : hero, { ...newSection('products'), id: 'products' }, { ...newSection('benefits'), id: 'benefits' }];
}

export const effectiveSections = (theme: StorefrontConfig, hasBanners: boolean) => theme.home?.sections ?? defaultHomeSections(theme, hasBanners);

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateSection(list: HomeSection[], id: string): HomeSection[] {
  const index = list.findIndex(section => section.id === id);
  if (index < 0 || list.length >= 30) return list;
  const copy: HomeSection = { ...structuredClone(list[index]), id: newSectionId(list[index].type) };
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}
