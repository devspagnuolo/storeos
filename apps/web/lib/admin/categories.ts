import 'server-only';
import type { Category } from '../api';
import { currentStoreSlug, serverApiUrl } from './session';

export async function adminCategories(): Promise<Category[]> {
  const response = await fetch(`${serverApiUrl}/catalog/categories?store=${encodeURIComponent(await currentStoreSlug())}`, { cache: 'no-store' }).catch(() => undefined);
  return response?.ok ? response.json() : [];
}
