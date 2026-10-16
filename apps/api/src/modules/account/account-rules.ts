import { createHash, randomBytes, randomInt } from 'node:crypto';

export const CODE_MINUTES = 15;
export const CODE_MAX_ATTEMPTS = 5;
/** Códigos pedidos por e-mail em cada janela de validade (evita encher a caixa de alguém). */
export const CODES_PER_WINDOW = 3;
export const SESSION_DAYS = 30;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Código de 6 dígitos; o hash amarra o código ao e-mail, então o mesmo número não serve para outra conta. */
export function newLoginCode(email: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, hash: hashLoginCode(email, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) };
}

export const hashLoginCode = (email: string, code: string) => sha256(`${normalizeEmail(email)}:${code.replace(/\D/g, '')}`);

export function newSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) };
}

export const hashSessionToken = (token: string) => sha256(token);

/** CPF/CNPJ só com os últimos dígitos visíveis. */
export function maskDocument(document: string | null | undefined) {
  const digits = document?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  return digits.length === 11 ? `***.***.${digits.slice(6, 9)}-${digits.slice(9)}` : `**.***.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function loginCodeMail(input: { name: string; storeName: string; code: string }) {
  const first = input.name.trim().split(/\s+/)[0] || 'tudo bem';
  const subject = `${input.code} é seu código para entrar na ${input.storeName}`;
  const text = `Oi, ${first}!\n\nSeu código para entrar em "Minha conta" na ${input.storeName} é:\n\n${input.code}\n\nEle vale por ${CODE_MINUTES} minutos. Se não foi você, ignore esta mensagem.\n`;
  const html = `<p>Oi, ${escapeHtml(first)}!</p><p>Seu código para entrar em <b>Minha conta</b> na ${escapeHtml(input.storeName)} é:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p><p style="color:#64748b;font-size:12px">Ele vale por ${CODE_MINUTES} minutos. Se não foi você, ignore esta mensagem.</p>`;
  return { subject, text, html };
}
