import { createHash, randomBytes } from 'node:crypto';

/** Endereços que a plataforma usa e nenhuma loja pode ocupar. */
export const RESERVED_SLUGS = ['admin', 'api', 'app', 'painel', 'www', 'mail', 'static', 'assets', 'login', 'suporte', 'ajuda', 'blog', 'loja', 'storeos', 'demo', 'teste', 'test', 'smtp', 'send', 'ftp', 'ns1', 'ns2', 'webmail', 'status', 'docs', 'cdn', 'img', 'dev', 'staging', 'painel-admin'];

/** "Vivi Moda Plus Size!" -> "vivi-moda-plus-size": sem acentos, só letras e números, de 3 a 40 caracteres. */
export function slugify(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return base;
}

export const isValidSlug = (slug: string) => /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug) && !RESERVED_SLUGS.includes(slug);

/** Escolhe um endereço livre a partir do nome: tenta o nome puro e depois acrescenta -2, -3… */
export function pickSlug(name: string, taken: ReadonlySet<string>): string | null {
  const base = slugify(name);
  if (base.length < 3) return null;
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 40 - String(n).length - 1)}-${n}`;
    if (isValidSlug(candidate) && !taken.has(candidate)) return candidate;
  }
  return null;
}

export type SignupInput = { ownerName: string; email: string; password: string; storeName: string; acceptTerms: boolean };

/** Primeiro problema encontrado nos dados do cadastro, ou null. */
export function signupProblem(input: SignupInput): string | null {
  const name = input.ownerName.trim();
  if (name.length < 2 || name.length > 80) return 'Informe o seu nome (2 a 80 letras)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || input.email.length > 254) return 'Informe um e-mail válido';
  const store = input.storeName.trim();
  if (store.length < 3 || store.length > 60) return 'O nome da loja deve ter de 3 a 60 letras';
  if (slugify(store).length < 3) return 'O nome da loja precisa ter pelo menos 3 letras ou números';
  const password = input.password;
  if (password.length < 12) return 'A senha deve ter pelo menos 12 caracteres';
  if (password.length > 200) return 'A senha é longa demais';
  if (new Set(password).size < 5) return 'A senha é muito repetitiva; misture letras, números e símbolos';
  if (password.toLowerCase().includes(input.email.split('@')[0].toLowerCase()) && input.email.split('@')[0].length >= 4) return 'A senha não pode conter o seu e-mail';
  if (!input.acceptTerms) return 'Para continuar, aceite os termos de uso e a política de privacidade';
  return null;
}

export const VERIFICATION_HOURS = 48;

export function newVerificationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_HOURS * 3_600_000) };
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function verificationMail(input: { ownerName: string; storeName: string; link: string }) {
  const first = input.ownerName.trim().split(/\s+/)[0] || 'tudo bem';
  const subject = `Confirme seu e-mail para abrir a loja ${input.storeName}`;
  const text = `Oi, ${first}!\n\nPara liberar o painel da loja ${input.storeName}, confirme que este e-mail é seu:\n\n${input.link}\n\nO link vale por ${VERIFICATION_HOURS} horas. Se não foi você, ignore esta mensagem.\n`;
  const html = `<p>Oi, ${escapeHtml(first)}!</p><p>Para liberar o painel da loja <b>${escapeHtml(input.storeName)}</b>, confirme que este e-mail é seu:</p><p><a href="${escapeHtml(input.link)}">Confirmar meu e-mail</a></p><p style="color:#64748b;font-size:12px">O link vale por ${VERIFICATION_HOURS} horas. Se não foi você, ignore esta mensagem.</p>`;
  return { subject, text, html };
}

export const BUSINESS_STAGES = ['starting', 'online', 'physical'] as const;
export const SEGMENTS = ['moda', 'beleza', 'casa', 'eletronicos', 'alimentos', 'esporte', 'infantil', 'outros'] as const;
export type BusinessProfile = { segment?: (typeof SEGMENTS)[number]; stage?: (typeof BUSINESS_STAGES)[number]; phone?: string; cnpj?: string; city?: string };

const digits = (s: string) => s.replace(/\D/g, '');

/** CNPJ válido pelos dígitos verificadores. */
export function isValidCnpj(raw: string): boolean {
  const d = digits(raw);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0; let pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += Number(d[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Limpa o perfil comercial; devolve erro em português quando algo não confere. */
export function parseProfile(input: Record<string, unknown>): { ok: true; profile: BusinessProfile } | { ok: false; error: string } {
  const profile: BusinessProfile = {};
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (input.segment) { if (!(SEGMENTS as readonly string[]).includes(text(input.segment))) return { ok: false, error: 'Escolha um segmento da lista' }; profile.segment = text(input.segment) as BusinessProfile['segment']; }
  if (input.stage) { if (!(BUSINESS_STAGES as readonly string[]).includes(text(input.stage))) return { ok: false, error: 'Escolha o momento do seu negócio' }; profile.stage = text(input.stage) as BusinessProfile['stage']; }
  if (input.phone) { const d = digits(text(input.phone)); if (d.length < 10 || d.length > 13) return { ok: false, error: 'Telefone inválido: informe DDD e número' }; profile.phone = d; }
  if (input.cnpj) { if (!isValidCnpj(text(input.cnpj))) return { ok: false, error: 'CNPJ inválido' }; profile.cnpj = digits(text(input.cnpj)); }
  if (input.city) { const c = text(input.city); if (c.length > 80) return { ok: false, error: 'Cidade muito longa' }; if (c) profile.city = c; }
  return { ok: true, profile };
}
