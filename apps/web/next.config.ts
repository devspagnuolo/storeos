import type { NextConfig } from 'next';

/** Cabeçalhos de proteção em todas as páginas. A loja e o painel só se abrem dentro de páginas do próprio site (prévia do editor). */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  // CSP mínima que não depende da lista de scripts de terceiros (Mercado Pago, GTM, GA4, Meta): bloqueia plugins,
  // troca da base dos links e a página aberta dentro de outro site. Restringir scripts exige testar o checkout com cartão.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
