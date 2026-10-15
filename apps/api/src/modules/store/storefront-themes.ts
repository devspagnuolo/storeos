import { sanitizeStorefrontConfig, type StorefrontConfig } from './storefront-config';
import type { HomeSection } from './storefront-sections';

/**
 * Temas prontos: pontos de partida completos (visual + seções), escritos pelo STOREOS.
 * Aplicar um tema só grava o rascunho; nada vai ao ar sem o lojista publicar.
 * O token {loja} é trocado pelo nome da loja ao aplicar.
 */
export type ReadyTheme = {
  key: string;
  name: string;
  tagline: string;
  /** Segmentos do cadastro (Primeiros passos) para os quais o tema é sugerido. */
  segments: string[];
  config: StorefrontConfig;
};

const section = (id: string, type: HomeSection['type'], props: Record<string, unknown> = {}): HomeSection => ({ id, type, hidden: false, props });
const benefits = (...items: [string, string][]) => section('beneficios', 'benefits', { items: items.map(([title, text]) => ({ title, text })) });
const newsletter = (text: string) => section('newsletter', 'newsletter', { heading: 'Receba novidades', text });
const testimonials = () => section('depoimentos', 'testimonials', {
  heading: 'Quem comprou recomenda',
  items: [
    { name: 'Cliente da {loja}', text: 'Chegou rápido e do jeito que eu esperava. Voltarei a comprar.' },
    { name: 'Cliente da {loja}', text: 'Atendimento atencioso e produto de ótima qualidade.' },
  ],
});

const commonPages = (productHeading: string): NonNullable<StorefrontConfig['pages']> => ({
  category: { sections: [section('categoria-beneficios', 'benefits', { items: [{ title: 'Troca facilitada', text: 'Primeira troca sem custo.' }, { title: 'Compra segura', text: 'Seus dados protegidos.' }] })] },
  product: { sections: [section('produto-relacionados', 'products', { heading: productHeading, subheading: '', limit: 4, categorySlug: '', productIds: [] }), newsletter('Avisamos você sobre lançamentos e promoções.')] },
});

export const READY_THEMES: ReadyTheme[] = [
  {
    key: 'essencial',
    name: 'Essencial',
    tagline: 'Limpo e versátil, serve para qualquer tipo de loja.',
    segments: ['outros', 'casa'],
    config: {
      accentColor: '#5B3DF5',
      announcementText: 'Frete grátis em compras acima de R$ 199',
      design: { preset: 'classico', font: 'sans', buttonRadius: 'md', containerWidth: 'normal', spacing: 'normal' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Bem-vindo à {loja}', description: 'Conheça nossas novidades e aproveite as condições da semana.', cta: 'Ver produtos', ctaHref: '/categorias' }),
        section('categorias', 'categories', { heading: 'Compre por categoria', limit: 6 }),
        section('novidades', 'products', { heading: 'Novidades', subheading: 'Acabaram de chegar', limit: 8, categorySlug: '', productIds: [] }),
        benefits(['Entrega para todo o Brasil', 'Calculamos o frete pelo seu CEP.'], ['Pague com PIX', 'Aprovação na hora.'], ['Compra segura', 'Seus dados protegidos.']),
        testimonials(),
        newsletter('Cadastre seu e-mail e receba ofertas em primeira mão.'),
      ] },
      pages: commonPages('Você também pode gostar'),
    },
  },
  {
    key: 'elegante',
    name: 'Elegante',
    tagline: 'Espaçoso e sofisticado, ideal para moda e acessórios.',
    segments: ['moda'],
    config: {
      accentColor: '#9D174D',
      announcementText: 'Parcele em até 6x sem juros',
      design: { preset: 'minimalista', font: 'serif', buttonRadius: 'none', containerWidth: 'wide', spacing: 'relaxed', backgroundColor: '#FFFBF7', textColor: '#1F1720' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'A nova coleção da {loja}', description: 'Peças pensadas para valorizar você em todas as ocasiões.', cta: 'Descobrir a coleção', ctaHref: '/categorias' }),
        section('novidades', 'products', { heading: 'Lançamentos', subheading: 'Escolhidos a dedo', limit: 8, categorySlug: '', productIds: [] }),
        section('categorias', 'categories', { heading: 'Explore por categoria', limit: 6 }),
        section('historia', 'text', { heading: 'Sobre a {loja}', body: 'Conte aqui a história da sua marca, o que inspira suas coleções e o cuidado em cada detalhe.', align: 'center' }),
        testimonials(),
        benefits(['Troca facilitada', 'Primeira troca sem custo.'], ['Embalagem cuidadosa', 'Pronta para presente.'], ['Pague com PIX', 'Aprovação na hora.']),
        newsletter('Seja a primeira a saber das novas coleções.'),
      ] },
      pages: commonPages('Combina com'),
    },
  },
  {
    key: 'vibrante',
    name: 'Vibrante',
    tagline: 'Colorido e alegre, ótimo para infantil, esporte e presentes.',
    segments: ['infantil', 'esporte'],
    config: {
      accentColor: '#E11D74',
      announcementText: 'Compre hoje e receba rápido',
      design: { preset: 'vibrante', font: 'rounded', buttonRadius: 'full', containerWidth: 'normal', spacing: 'compact' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Ofertas que fazem a festa', description: 'Escolha seus favoritos na {loja} e receba em casa.', cta: 'Quero aproveitar', ctaHref: '/categorias' }),
        benefits(['Frete para todo o Brasil', 'Calculamos pelo CEP.'], ['Pague com PIX', 'Aprovação na hora.'], ['Troca sem complicação', 'Fale com a gente.']),
        section('mais-vendidos', 'products', { heading: 'Mais queridos', subheading: 'Os favoritos dos clientes', limit: 8, categorySlug: '', productIds: [] }),
        section('categorias', 'categories', { heading: 'Escolha por categoria', limit: 8 }),
        newsletter('Receba cupons e novidades no seu e-mail.'),
      ] },
      pages: commonPages('Quem viu também gostou'),
    },
  },
  {
    key: 'natural',
    name: 'Natural',
    tagline: 'Tons de verde e leveza, para beleza, bem-estar e casa.',
    segments: ['beleza', 'casa'],
    config: {
      accentColor: '#166534',
      announcementText: 'Frete grátis nas compras acima de R$ 150',
      design: { preset: 'classico', font: 'serif', buttonRadius: 'full', containerWidth: 'normal', spacing: 'relaxed', backgroundColor: '#F7FAF5', textColor: '#14231A' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Cuide de você com a {loja}', description: 'Produtos selecionados para o seu dia a dia, com carinho e qualidade.', cta: 'Conhecer os produtos', ctaHref: '/categorias' }),
        section('categorias', 'categories', { heading: 'Nossas linhas', limit: 6 }),
        section('queridinhos', 'products', { heading: 'Queridinhos', subheading: 'Os mais pedidos', limit: 8, categorySlug: '', productIds: [] }),
        section('historia', 'text', { heading: 'Por que escolher a {loja}', body: 'Explique seus diferenciais: ingredientes, origem, processo de produção ou o cuidado no atendimento.', align: 'center' }),
        testimonials(),
        newsletter('Dicas e novidades direto no seu e-mail.'),
      ] },
      pages: commonPages('Complete sua rotina'),
    },
  },
  {
    key: 'tecnologia',
    name: 'Tecnologia',
    tagline: 'Moderno e direto ao ponto, para eletrônicos e acessórios.',
    segments: ['eletronicos'],
    config: {
      accentColor: '#0F4C81',
      announcementText: 'Parcele em até 12x no cartão',
      design: { preset: 'moderno', font: 'sans', buttonRadius: 'sm', containerWidth: 'wide', spacing: 'normal', backgroundColor: '#F8FAFC', textColor: '#0F172A' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Tecnologia que facilita o seu dia', description: 'Os melhores produtos com garantia e entrega rápida na {loja}.', cta: 'Ver ofertas', ctaHref: '/categorias' }),
        benefits(['Garantia', 'Produtos com nota fiscal.'], ['Entrega rápida', 'Enviamos em até 1 dia útil.'], ['Até 12x', 'Parcele no cartão.'], ['Suporte', 'Atendimento pelo WhatsApp.']),
        section('destaques', 'products', { heading: 'Em destaque', subheading: 'Seleção da semana', limit: 8, categorySlug: '', productIds: [] }),
        section('categorias', 'categories', { heading: 'Categorias', limit: 8 }),
        newsletter('Ofertas e lançamentos no seu e-mail.'),
      ] },
      pages: commonPages('Acessórios recomendados'),
    },
  },
  {
    key: 'gourmet',
    name: 'Gourmet',
    tagline: 'Quente e acolhedor, para alimentos, bebidas e presentes.',
    segments: ['alimentos'],
    config: {
      accentColor: '#B45309',
      announcementText: 'Produzido com carinho, entregue com cuidado',
      design: { preset: 'classico', font: 'serif', buttonRadius: 'md', containerWidth: 'normal', spacing: 'normal', backgroundColor: '#FFFBEB', textColor: '#3B2410' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Sabor que conquista', description: 'Descubra os produtos da {loja} e peça sem sair de casa.', cta: 'Ver cardápio', ctaHref: '/categorias' }),
        section('favoritos', 'products', { heading: 'Mais pedidos', subheading: 'Os favoritos da casa', limit: 8, categorySlug: '', productIds: [] }),
        section('categorias', 'categories', { heading: 'Escolha sua categoria', limit: 6 }),
        benefits(['Frescor garantido', 'Embalagem que conserva.'], ['Entrega cuidadosa', 'Acompanhe o pedido.'], ['Pague com PIX', 'Aprovação na hora.']),
        testimonials(),
        newsletter('Receba promoções e novidades da casa.'),
      ] },
      pages: commonPages('Combina com'),
    },
  },
];

const replaceTokens = (value: unknown, store: string): unknown => {
  if (typeof value === 'string') return value.replaceAll('{loja}', store);
  if (Array.isArray(value)) return value.map(item => replaceTokens(item, store));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, store)]));
  return value;
};

export function findReadyTheme(key: string) { return READY_THEMES.find(theme => theme.key === key); }

/**
 * Monta a configuração do rascunho: o tema define visual e seções; logo e favicon atuais da loja são preservados.
 * O resultado passa pelo mesmo saneamento de qualquer edição do lojista.
 */
export function buildThemeConfig(theme: ReadyTheme, storeName: string, current: StorefrontConfig | null): StorefrontConfig {
  const name = storeName.trim().slice(0, 40) || 'nossa loja';
  const themed = replaceTokens(theme.config, name) as StorefrontConfig;
  const design = { ...themed.design };
  if (current?.design?.logoUrl) design.logoUrl = current.design.logoUrl;
  if (current?.design?.faviconUrl) design.faviconUrl = current.design.faviconUrl;
  return sanitizeStorefrontConfig({ ...themed, design });
}
