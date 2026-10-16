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
const storeSlug = process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';
/** Primeiros trechos que a própria loja usa: nunca consultam redirecionamentos. */
const STORE_ROOTS = new Set(['', 'produto', 'categorias', 'colecoes', 'marcas', 'p', 'busca', 'carrinho', 'checkout', 'conta', 'acompanhar', 'descadastro', 'newsletter', 'recuperar', 'previa', 'criar-loja']);
const redirectCache = new Map<string, { to: string | null; at: number }>();
const CACHE_MS = 60_000;

/** Endereço antigo cadastrado em /painel/redirecionamentos? Consulta a API e guarda a resposta por 1 minuto. */
async function findRedirect(request: NextRequest): Promise<string | null> {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(',')[0].trim().split(':')[0].toLowerCase();
  const key = `${host}${request.nextUrl.pathname}`;
  const cached = redirectCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.to;
  let to: string | null = null;
  try {
    const query = new URLSearchParams({ store: storeSlug, host, path: request.nextUrl.pathname });
    const response = await fetch(`${apiUrl}/redirects/resolve?${query}`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) to = ((await response.json()) as { to: string }).to;
    else if (response.status !== 404) return null;
  } catch {
    return null;
  }
  if (redirectCache.size > 500) redirectCache.clear();
  redirectCache.set(key, { to, at: Date.now() });
  return to;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const root = pathname.split('/')[1] ?? '';
  if (root !== 'admin' && root !== 'painel') {
    // O layout precisa do caminho para decidir se mostra a página "loja em construção".
    const pass = () => {
      const forwarded = new Headers(request.headers);
      forwarded.set('x-pathname', pathname);
      return NextResponse.next({ request: { headers: forwarded } });
    };
    if (STORE_ROOTS.has(root) || (request.method !== 'GET' && request.method !== 'HEAD')) return pass();
    const to = await findRedirect(request);
    return to ? NextResponse.redirect(new URL(to, request.url), 301) : pass();
  }

  // Mantém links antigos funcionando e direciona o navegador para a URL pública.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = pathname.replace(/^\/admin(?=\/|$)/, '/painel');
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const internalUrl = request.nextUrl.clone();
  internalUrl.pathname = pathname.replace(/^\/painel(?=\/|$)/, '/admin');
  // Sem o caminho, o layout raiz não sabe que é o painel e mostra a faixa da loja no topo.
  const withPath = () => {
    const forwarded = new Headers(request.headers);
    forwarded.set('x-pathname', internalUrl.pathname);
    return { request: { headers: forwarded } };
  };

  // Login precisa ser acessível sem sessão, mas a URL pública continua em /painel.
  if (internalUrl.pathname === '/admin/login' || internalUrl.pathname.startsWith('/admin/login/')) {
    return NextResponse.rewrite(internalUrl, withPath());
  }

  const rewrite = () => NextResponse.rewrite(internalUrl, withPath());
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

  const next = NextResponse.rewrite(internalUrl, withPath());
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

export const config = {
  // Painel e qualquer endereço que não seja arquivo estático: o que não for da loja é conferido contra os redirecionamentos.
  matcher: ['/admin/:path*', '/painel/:path*', '/((?!_next/|api/|.*\\..*).+)'],
};
