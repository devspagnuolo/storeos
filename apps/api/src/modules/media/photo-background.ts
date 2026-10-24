/** Fundo padrão das fotos de produto, salvo por loja em Store.photoBackground. */
export type PhotoBackground = { enabled: boolean; color: string };

export const DEFAULT_PHOTO_BACKGROUND: PhotoBackground = { enabled: false, color: '#F2F2F2' };
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parsePhotoBackground(raw: unknown): PhotoBackground {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    enabled: value.enabled === true,
    color: typeof value.color === 'string' && HEX_COLOR.test(value.color) ? value.color.toUpperCase() : DEFAULT_PHOTO_BACKGROUND.color,
  };
}

/** Executa no máximo `limit` tarefas ao mesmo tempo, mantendo a ordem dos resultados. */
export async function inBatches<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let start = 0; start < items.length; start += limit) {
    const slice = items.slice(start, start + limit);
    (await Promise.all(slice.map((item, i) => work(item, start + i)))).forEach((result, i) => { results[start + i] = result; });
  }
  return results;
}
