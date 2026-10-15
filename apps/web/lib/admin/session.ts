import { revalidatePath } from 'next/cache';
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ACCESS_COOKIE = 'storeos_at';
export const REFRESH_COOKIE = 'storeos_rt';
export const STORE_COOKIE = 'storeos_store';

export const serverApiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export type Session = { accessToken: string; expiresIn: number; refreshToken: string; user: { name: string; email: string; permissions: string[]; store: { slug: string; name: string } } };

const secure = process.env.NODE_ENV === 'production';

/** Grava a sessão em cookies httpOnly; o access token expira um pouco antes do JWT para forçar a renovação. */
export async function saveSession(session: Session) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, session.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: session.expiresIn - 60 });
  jar.set(REFRESH_COOKIE, session.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86_400 });
  jar.set(STORE_COOKIE, session.user.store.slug, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86_400 });
}

export async function clearSession() {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, STORE_COOKIE]) jar.delete(name);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Chama a API autenticado como o usuário do painel. Sem sessão válida, manda para o login. */
export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/admin/login');
  const response = await fetch(`${serverApiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/admin/login');
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
    throw new ApiError(response.status, message || 'Erro inesperado na API');
  }
  // Toda alteração feita pelo painel derruba o cache da vitrine: produtos, preços, estoque, banners e tema aparecem na hora no site.
  if (init.method && init.method !== 'GET') refreshStorefront();
  return body as T;
}

function refreshStorefront() {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // Fora de uma ação (renderização), não há o que invalidar.
  }
}

export async function currentStoreSlug() {
  return (await cookies()).get(STORE_COOKIE)?.value ?? process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';
}
