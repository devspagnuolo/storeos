import { NextRequest, NextResponse } from 'next/server';

const ACCESS_COOKIE = 'storeos_at';
const REFRESH_COOKIE = 'storeos_rt';
const apiUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001/api/v1';

/**
 * Publica o painel em /painel, preservando /admin como rota interna compatível
 * com os links existentes na aplicação.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Mantém links antigos funcionando e direciona o navegador para a URL pública.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = pathname.replace(/^\/admin(?=\/|$)/, '/painel');
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const internalUrl = request.nextUrl.clone();
  internalUrl.pathname = pathname.replace(/^\/painel(?=\/|$)/, '/admin');

  // Login precisa ser acessível sem sessão, mas a URL pública continua em /painel.
  if (internalUrl.pathname === '/admin/login' || internalUrl.pathname.startsWith('/admin/login/')) {
    return NextResponse.rewrite(internalUrl);
  }

  const rewrite = () => NextResponse.rewrite(internalUrl);
  if (request.cookies.get(ACCESS_COOKIE)) return rewrite();

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const login = new URL('/painel/login', request.url);
  if (!refreshToken) return NextResponse.redirect(login);

  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);

  if (!response?.ok) {
    const redirect = NextResponse.redirect(login);
    redirect.cookies.delete(REFRESH_COOKIE);
    return redirect;
  }

  const session = await response.json();
  request.cookies.set(ACCESS_COOKIE, session.accessToken);
  request.cookies.set(REFRESH_COOKIE, session.refreshToken);

  const next = NextResponse.rewrite(internalUrl, {
    request: { headers: request.headers },
  });
  const secure = process.env.NODE_ENV === 'production';
  next.cookies.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: session.expiresIn - 60,
  });
  next.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
  });
  return next;
}

export const config = { matcher: ['/admin/:path*', '/painel/:path*'] };
