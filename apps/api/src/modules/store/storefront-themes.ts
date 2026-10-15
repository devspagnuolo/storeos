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
  {
    key: 'aurora',
    name: 'Aurora',
    tagline: 'Moderno e luminoso: destaque centralizado, cartões com sombra e cantos arredondados.',
    segments: ['moda', 'beleza', 'outros'],
    config: {
      accentColor: '#6D28D9',
      announcementText: 'Frete grátis acima de R$ 199 • Pague com PIX e ganhe desconto',
      design: { preset: 'moderno', font: 'sans', buttonRadius: 'full', containerWidth: 'wide', spacing: 'relaxed', cardStyle: 'elevated', headingFont: 'display', heroTone: 'brand', mode: 'light', backgroundColor: '#FAF9FF', textColor: '#1B1536' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Descubra o novo jeito de comprar na {loja}', description: 'Curadoria feita para você, com entrega rápida e pagamento seguro.', cta: 'Explorar agora', ctaHref: '/categorias', layout: 'centered' }),
        section('categorias', 'categories', { heading: 'Navegue por categoria', limit: 6, layout: 'circles' }),
        section('novidades', 'products', { heading: 'Novidades da semana', subheading: 'RECÉM-CHEGADOS', limit: 8, categorySlug: '', productIds: [], columns: '4' }),
        benefits(['Entrega para todo o Brasil', 'Calculamos pelo CEP.'], ['PIX com aprovação na hora', 'Sem filas, sem espera.'], ['Troca facilitada', 'Fale com a gente.']),
        testimonials(),
        newsletter('Receba lançamentos e ofertas antes de todo mundo.'),
      ] },
      pages: commonPages('Você também vai gostar'),
    },
  },
  {
    key: 'noir',
    name: 'Noir',
    tagline: 'Tema escuro e ousado, com destaque sobre a imagem. Para streetwear, esporte e eletrônicos.',
    segments: ['esporte', 'eletronicos', 'moda'],
    config: {
      accentColor: '#A3E635',
      announcementText: 'Drop novo toda semana • Frete grátis acima de R$ 250',
      design: { preset: 'moderno', font: 'sans', buttonRadius: 'sm', containerWidth: 'wide', spacing: 'normal', cardStyle: 'outline', headingFont: 'display', heroTone: 'dark', mode: 'dark', backgroundColor: '#0A0A0B', textColor: '#F4F4F5' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Estilo sem pedir licença', description: 'Peças e acessórios selecionados da {loja}. Estoque limitado.', cta: 'Ver lançamentos', ctaHref: '/categorias', layout: 'overlay' }),
        section('mais-vendidos', 'products', { heading: 'Mais vendidos', subheading: 'EM ALTA', limit: 8, categorySlug: '', productIds: [], columns: '4' }),
        section('categorias', 'categories', { heading: 'Categorias', limit: 6, layout: 'cards' }),
        benefits(['Envio em até 24h', 'Pedidos pagos saem rápido.'], ['Parcele em 12x', 'No cartão de crédito.'], ['Troca grátis', 'Na primeira compra.']),
        newsletter('Entre para a lista e saiba dos drops primeiro.'),
      ] },
      pages: commonPages('Complete o look'),
    },
  },
  {
    key: 'linho',
    name: 'Linho',
    tagline: 'Neutro, calmo e editorial: muito espaço, tipografia com serifa e cartões sem moldura.',
    segments: ['casa', 'moda', 'beleza'],
    config: {
      accentColor: '#8A5A44',
      announcementText: 'Entrega cuidadosa para todo o Brasil',
      design: { preset: 'minimalista', font: 'sans', buttonRadius: 'none', containerWidth: 'normal', spacing: 'relaxed', cardStyle: 'flat', headingFont: 'serif', heroTone: 'light', mode: 'light', backgroundColor: '#FAF8F5', textColor: '#2B2622' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Peças que duram, ambientes que acolhem', description: 'Conheça a seleção da {loja}, feita com materiais honestos e acabamento cuidadoso.', cta: 'Ver a coleção', ctaHref: '/categorias', layout: 'split' }),
        section('categorias', 'categories', { heading: 'Ambientes e linhas', limit: 6, layout: 'cards' }),
        section('selecao', 'products', { heading: 'Nossa seleção', subheading: 'FAVORITOS', limit: 6, categorySlug: '', productIds: [], columns: '3' }),
        section('historia', 'text', { heading: 'Feito com calma', body: 'Conte aqui a história da {loja}: de onde vêm os materiais, quem faz e por que cada detalhe importa.', align: 'center' }),
        testimonials(),
        newsletter('Inspirações e novidades, sem excesso.'),
      ] },
      pages: commonPages('Combina com'),
    },
  },
  {
    key: 'pop',
    name: 'Pop',
    tagline: 'Alegre e colorido, com destaque centralizado e cartões macios. Ótimo para infantil e presentes.',
    segments: ['infantil', 'alimentos', 'esporte'],
    config: {
      accentColor: '#F97316',
      announcementText: 'Hoje tem oferta! Frete grátis acima de R$ 150',
      design: { preset: 'vibrante', font: 'rounded', buttonRadius: 'full', containerWidth: 'normal', spacing: 'compact', cardStyle: 'soft', headingFont: 'display', heroTone: 'brand', mode: 'light', backgroundColor: '#FFF8F1', textColor: '#2A1A0F' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Diversão do tamanho da sua vontade', description: 'Escolha na {loja} e receba em casa, com carinho.', cta: 'Quero ver tudo', ctaHref: '/categorias', layout: 'centered' }),
        section('categorias', 'categories', { heading: 'Escolha por categoria', limit: 8, layout: 'circles' }),
        section('queridinhos', 'products', { heading: 'Os queridinhos', subheading: 'MAIS PEDIDOS', limit: 8, categorySlug: '', productIds: [], columns: '4' }),
        benefits(['Frete para todo o Brasil', 'Calculamos pelo CEP.'], ['Pague com PIX', 'Aprovação na hora.'], ['Troca sem complicação', 'Estamos aqui para ajudar.']),
        newsletter('Cupons e novidades no seu e-mail.'),
      ] },
      pages: commonPages('Quem viu também gostou'),
    },
  },
  {
    key: 'oceano',
    name: 'Oceano',
    tagline: 'Limpo e confiável, em tons de azul: destaque lateral e cartões com contorno fino.',
    segments: ['eletronicos', 'casa', 'outros'],
    config: {
      accentColor: '#0369A1',
      announcementText: 'Compra segura • Parcele em até 12x',
      design: { preset: 'classico', font: 'sans', buttonRadius: 'md', containerWidth: 'wide', spacing: 'normal', cardStyle: 'outline', headingFont: 'same', heroTone: 'light', mode: 'light', backgroundColor: '#F5FAFD', textColor: '#0B2536' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Tudo o que você precisa, em um só lugar', description: 'Produtos selecionados, preços justos e entrega rastreada na {loja}.', cta: 'Ver ofertas', ctaHref: '/categorias', layout: 'split' }),
        benefits(['Compra protegida', 'Seus dados seguros.'], ['Entrega rastreada', 'Acompanhe cada etapa.'], ['Até 12x', 'No cartão.'], ['Atendimento humano', 'Resposta rápida.']),
        section('destaques', 'products', { heading: 'Em destaque', subheading: 'SELEÇÃO DA SEMANA', limit: 8, categorySlug: '', productIds: [], columns: '4' }),
        section('categorias', 'categories', { heading: 'Categorias', limit: 6, layout: 'cards' }),
        newsletter('Ofertas e lançamentos no seu e-mail.'),
      ] },
      pages: commonPages('Acessórios recomendados'),
    },
  },
  {
    key: 'rose',
    name: 'Rosé',
    tagline: 'Delicado e elegante, com títulos em serifa e destaque suave. Para beleza e moda feminina.',
    segments: ['beleza', 'moda', 'infantil'],
    config: {
      accentColor: '#BE185D',
      announcementText: 'Presente de boas-vindas na primeira compra',
      design: { preset: 'moderno', font: 'sans', buttonRadius: 'full', containerWidth: 'normal', spacing: 'relaxed', cardStyle: 'soft', headingFont: 'serif', heroTone: 'light', mode: 'light', backgroundColor: '#FFF7F9', textColor: '#3A1424' },
      home: { sections: [
        section('banners', 'banners'),
        section('destaque', 'hero', { title: 'Realce o que há de mais bonito em você', description: 'Descubra a seleção da {loja}, pensada para o seu dia a dia.', cta: 'Conhecer a seleção', ctaHref: '/categorias', layout: 'centered' }),
        section('queridinhos', 'products', { heading: 'Queridinhos', subheading: 'MAIS AMADOS', limit: 8, categorySlug: '', productIds: [], columns: '4' }),
        section('categorias', 'categories', { heading: 'Explore por categoria', limit: 6, layout: 'circles' }),
        testimonials(),
        benefits(['Embalagem de presente', 'Cuidado em cada detalhe.'], ['Pague com PIX', 'Aprovação na hora.'], ['Troca facilitada', 'Primeira troca sem custo.']),
        newsletter('Dicas, novidades e mimos no seu e-mail.'),
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
