import 'server-only';
import { cookies } from 'next/headers';
import { apiUrl } from '../config';

/** Token da sessão do cliente (httpOnly) e um aviso sem segredo para o cabeçalho saber que há alguém logado. */
export const CUSTOMER_COOKIE = 'storeos_customer';
export const CUSTOMER_FLAG_COOKIE = 'storeos_customer_in';

const serverApiUrl = process.env.API_INTERNAL_URL ?? apiUrl;
const secure = process.env.NODE_ENV === 'production';

export async function saveCustomerSession(token: string, expiresAt: string) {
  const jar = await cookies();
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  jar.set(CUSTOMER_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
  jar.set(CUSTOMER_FLAG_COOKIE, '1', { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge });
}

export async function clearCustomerSession() {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
  jar.delete(CUSTOMER_FLAG_COOKIE);
}

export async function hasCustomerSession() {
  return Boolean((await cookies()).get(CUSTOMER_COOKIE)?.value);
}

/** Chama a API como o cliente logado. Devolve null quando não há sessão válida (a página mostra o login). */
export async function accountFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const response = await fetch(`${serverApiUrl}/account${path}`, {
    method: init.method ?? 'GET',
    headers: { 'x-customer-token': token, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 404) return null;
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
    throw new Error(message || 'Não foi possível carregar agora.');
  }
  return body as T;
}

export const accountApiUrl = serverApiUrl;
