import { NextRequest, NextResponse } from 'next/server';

const ACCESS_COOKIE = 'storeos_at';
const REFRESH_COOKIE = 'storeos_rt';
const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Protege o painel e renova a sessão: se o access token venceu mas há refresh token,
 * troca por um par novo antes de a página renderizar.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin/login')) return NextResponse.next();
  if (request.cookies.get(ACCESS_COOKIE)) return NextResponse.next();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const login = new URL('/admin/login', request.url);
  if (!refreshToken) return NextResponse.redirect(login);

  const response = await fetch(`${apiUrl}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  if (!response?.ok) {
    const redirect = NextResponse.redirect(login);
    redirect.cookies.delete(REFRESH_COOKIE);
    return redirect;
  }
  const session = await response.json();
  // A página lê os cookies da requisição; o navegador recebe os mesmos valores na resposta.
  request.cookies.set(ACCESS_COOKIE, session.accessToken);
  request.cookies.set(REFRESH_COOKIE, session.refreshToken);
  const next = NextResponse.next({ request: { headers: request.headers } });
  const secure = process.env.NODE_ENV === 'production';
  next.cookies.set(ACCESS_COOKIE, session.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: session.expiresIn - 60 });
  next.cookies.set(REFRESH_COOKIE, session.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86_400 });
  return next;
}

export const config = { matcher: ['/admin/:path*'] };
