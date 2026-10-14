/** Constantes seguras para o navegador; a loja de cada requisição vem de `store-host.ts` (somente servidor). */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
export const defaultStoreSlug = process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';
export const defaultSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
