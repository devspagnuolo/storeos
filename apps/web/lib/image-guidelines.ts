export type MediaKind = 'banner' | 'banner-mobile' | 'category-banner' | 'category-banner-mobile' | 'product' | 'other';

/** Dimensões recomendadas por uso, mostradas ao lado de cada campo de imagem do painel. Mesma tabela da API. */
export const GUIDELINES: Record<Exclude<MediaKind, 'other'>, { width: number; height: number; hint: string }> = {
  banner: { width: 1920, height: 700, hint: 'Aparece em largura total no topo da loja.' },
  'banner-mobile': { width: 800, height: 1000, hint: 'Usada só em celulares; se ficar vazia, vale o banner normal.' },
  'category-banner': { width: 1920, height: 400, hint: 'Faixa fixa no topo da página da categoria.' },
  'category-banner-mobile': { width: 800, height: 500, hint: 'Usada só em celulares; se ficar vazia, vale o banner normal.' },
  product: { width: 1000, height: 1250, hint: 'Formato vertical 4:5. A primeira foto é a principal.' },
};

export const guidelineText = (kind: MediaKind) => (kind === 'other' ? 'PNG, JPG ou WebP de até 5 MB.' : `Tamanho recomendado: ${GUIDELINES[kind].width} × ${GUIDELINES[kind].height} px. ${GUIDELINES[kind].hint} PNG, JPG ou WebP de até 5 MB.`);
