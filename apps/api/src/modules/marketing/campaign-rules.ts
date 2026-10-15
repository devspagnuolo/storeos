import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveJwtSecret } from '../../shared/auth/jwt-secret';

export const AUDIENCES = ['ALL', 'NEWSLETTER', 'CUSTOMERS'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const MAX_RECIPIENTS = 20_000;

const key = () => process.env.INTEGRATIONS_KEY ?? resolveJwtSecret();
const sign = (payload: string) => createHmac('sha256', key()).update(`marketing-unsub:${payload}`).digest('base64url');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Token de descadastro: loja + e-mail assinados. Não expira, para o link de e-mails antigos continuar funcionando. */
export function makeUnsubscribeToken(storeId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ s: storeId, e: normalizeEmail(email) })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string): { storeId: string; email: string } | undefined {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return undefined;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { s?: string; e?: string };
    return s && e ? { storeId: s, email: e } : undefined;
  } catch {
    return undefined;
  }
}

/** Remove duplicados (ignorando maiúsculas) e endereços sem cara de e-mail. */
export function dedupeRecipients(list: { email: string; name?: string | null }[]) {
  const seen = new Map<string, { email: string; name: string | null }>();
  for (const item of list) {
    const email = normalizeEmail(item.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('.invalid')) continue;
    if (!seen.has(email)) seen.set(email, { email, name: item.name?.trim() || null });
  }
  return [...seen.values()];
}

export function validateCampaign(subject: string, body: string): string | null {
  if (subject.trim().length < 3 || subject.length > 150) return 'O assunto precisa ter entre 3 e 150 caracteres.';
  if (body.trim().length < 10 || body.length > 8000) return 'A mensagem precisa ter entre 10 e 8000 caracteres.';
  const unknown = [...(subject + body).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m => m[1]).filter(v => v !== 'nome' && v !== 'loja');
  if (unknown.length) return `Variável desconhecida: {{${unknown[0]}}}. Use só {{nome}} e {{loja}}.`;
  return null;
}
export const assertValidCampaign = (subject: string, body: string) => { const error = validateCampaign(subject, body); if (error) throw new BadRequestException(error); };

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#0f172a">${url}</a>`);
const fill = (template: string, vars: { nome: string; loja: string }) => template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => (vars as Record<string, string>)[name] ?? '');

/** Monta o e-mail da campanha. O rodapé com o link de descadastro é obrigatório e sempre vai junto. */
export function renderCampaignMail(input: { subject: string; body: string; storeName: string; recipientName?: string | null; unsubscribeUrl: string }) {
  const vars = { nome: input.recipientName?.trim().split(/\s+/)[0] || 'cliente', loja: input.storeName };
  const subject = fill(input.subject, vars).replace(/\s+/g, ' ').trim();
  const body = fill(input.body, vars).replace(/\n{3,}/g, '\n\n').trim();
  const footerText = `Você recebe este e-mail porque aceitou receber novidades de ${input.storeName}. Para não receber mais: ${input.unsubscribeUrl}`;
  const text = [body, '', footerText].join('\n');
  const paragraphs = body.split(/\n{2,}/).map(p => `<p>${p.split('\n').map(line => linkify(escapeHtml(line))).join('<br>')}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1e293b">${paragraphs}<p style="color:#94a3b8;font-size:12px;margin-top:32px">Você recebe este e-mail porque aceitou receber novidades de ${escapeHtml(input.storeName)}. <a href="${input.unsubscribeUrl}" style="color:#94a3b8">Não quero mais receber</a>.</p></div>`;
  return { subject, text, html };
}
