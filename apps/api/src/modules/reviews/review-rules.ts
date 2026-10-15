/** Pedidos em que o cliente já pagou e ainda vale a compra: só eles podem avaliar. */
export const REVIEWABLE_STATUSES = ['PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED'] as const;
export const isReviewableOrder = (status: string) => (REVIEWABLE_STATUSES as readonly string[]).includes(status);

const isControl = (char: string) => { const code = char.charCodeAt(0); return (code < 32 && code !== 9 && code !== 10) || code === 127; };
const clean = (text: string) => Array.from(text).filter(char => !isControl(char)).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

export type ReviewInput = { rating: number; title?: string | null; body: string };

/** Confere a nota e os textos; devolve os valores limpos ou a mensagem para o cliente. */
export function parseReview(input: ReviewInput): { ok: true; rating: number; title: string | null; body: string } | { ok: false; error: string } {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return { ok: false, error: 'A nota deve ser de 1 a 5 estrelas' };
  const body = clean(input.body ?? '');
  if (body.length < 10) return { ok: false, error: 'Conte um pouco mais sobre o produto (mínimo de 10 letras)' };
  if (body.length > 2000) return { ok: false, error: 'O comentário passa de 2000 letras' };
  const title = clean(input.title ?? '').replace(/\n/g, ' ');
  if (title.length > 80) return { ok: false, error: 'O título passa de 80 letras' };
  if (/https?:\/\/|www\./i.test(`${title} ${body}`)) return { ok: false, error: 'Não é possível enviar links na avaliação' };
  return { ok: true, rating: input.rating, title: title || null, body };
}

/** Nome para exibir: primeiro nome e inicial do sobrenome ("Maria S."). */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  return last ? `${first} ${last}.` : first;
}

/** Média (uma casa decimal), total e quantas avaliações em cada nota. */
export function summarize(ratings: number[]) {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of ratings) if (rating >= 1 && rating <= 5) distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
  const count = Object.values(distribution).reduce((sum, n) => sum + n, 0);
  const sum = ([1, 2, 3, 4, 5] as const).reduce((total, star) => total + star * distribution[star], 0);
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution };
}
