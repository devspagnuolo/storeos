import { apiUrl } from './config';
import { onlyDigits } from './payment';

export type DraftData = { name?: string; email?: string; phone?: string; zipCode?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string };
export type IdentifyResult = { status: 'draft'; data: DraftData } | { status: 'known'; maskedEmail: string } | { status: 'new' };

const TOKEN_KEY = 'storeos-checkout-token';
const LOCAL_KEY = 'storeos-checkout-draft';

const storage = () => { try { return window.localStorage; } catch { return undefined; } };

/** Segredo deste navegador que liga o cliente ao rascunho no servidor; criado uma vez e reaproveitado. */
export function draftToken() {
  const store = storage();
  const existing = store?.getItem(TOKEN_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const token = crypto.randomUUID();
  try { store?.setItem(TOKEN_KEY, token); } catch { /* sem storage: vale só nesta visita */ }
  return token;
}

/** Cópia local imediata, para nada se perder mesmo sem conexão. */
export function readLocalDraft(): { cpf?: string; data: DraftData } {
  try { return JSON.parse(storage()?.getItem(LOCAL_KEY) ?? '') ?? { data: {} }; } catch { return { data: {} }; }
}
export function writeLocalDraft(cpf: string, data: DraftData) {
  try { storage()?.setItem(LOCAL_KEY, JSON.stringify({ cpf, data })); } catch { /* sem storage */ }
}
export function clearLocalDraft() {
  try { storage()?.removeItem(LOCAL_KEY); } catch { /* sem storage */ }
}

async function post<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: method === 'PUT' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente de novo.' : (Array.isArray(result.message) ? 'Confira os dados informados.' : result.message) || 'Não foi possível continuar agora.');
  return result as T;
}

export const identifyCustomer = (storeSlug: string, cpf: string) => post<IdentifyResult>('/checkout/identify', 'POST', { storeSlug, token: draftToken(), cpf: onlyDigits(cpf) });
export const confirmCustomer = (storeSlug: string, cpf: string, email: string) => post<{ matched: boolean; data?: DraftData }>('/checkout/identify/confirm', 'POST', { storeSlug, token: draftToken(), cpf: onlyDigits(cpf), email: email.trim() });
/** Grava no servidor; falhas são silenciosas porque a cópia local já guardou tudo. */
export async function saveDraft(storeSlug: string, cpf: string, data: DraftData) {
  try { await post('/checkout/draft', 'PUT', { storeSlug, token: draftToken(), cpf: onlyDigits(cpf), data }); } catch { /* a cópia local cobre */ }
}

/** Campos de endereço vazios recebem o que a busca do CEP achou; o que o cliente já digitou nunca é sobrescrito. */
export function mergeAddress(data: DraftData, found: { street?: string; district?: string; city?: string; state?: string }): DraftData {
  const next = { ...data };
  for (const field of ['street', 'district', 'city', 'state'] as const) if (!next[field]?.trim() && found[field]) next[field] = found[field];
  return next;
}

export const formatPhone = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

type AccountData = { name: string; email: string; phone: string | null; address: { zipCode?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string } | null };

/**
 * Cliente logado: nome, telefone e o último endereço vêm da conta; o que ela já tinha digitado neste aparelho
 * (mesmo CPF) prevalece, porque é mais recente. O e-mail é sempre o da conta.
 */
export function draftFromAccount(account: AccountData, local: DraftData = {}): DraftData {
  const base: DraftData = { name: account.name, phone: account.phone ? formatPhone(account.phone) : undefined, ...account.address };
  const merged: DraftData = { ...base };
  for (const [key, value] of Object.entries(local) as [keyof DraftData, string | undefined][]) if (value?.trim()) merged[key] = value;
  merged.email = account.email;
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)) as DraftData;
}
