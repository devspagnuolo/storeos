/** Regras puras do rascunho do checkout: quais campos guardar e como mostrar o e-mail sem expô-lo. */

export const DRAFT_FIELDS = { name: 120, email: 180, phone: 20, zipCode: 9, street: 160, number: 20, complement: 80, district: 80, city: 80, state: 2, shippingRuleId: 120, paymentMethod: 20 } as const;
export type DraftField = keyof typeof DRAFT_FIELDS;
export type DraftData = Partial<Record<DraftField, string>>;

/** Mantém só os campos conhecidos, como texto aparado e no tamanho máximo; o resto (cartão, CPF) nunca é gravado aqui. */
export function sanitizeDraft(input: unknown): DraftData {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const out: DraftData = {};
  for (const [field, max] of Object.entries(DRAFT_FIELDS) as [DraftField, number][]) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) out[field] = value.trim().slice(0, max);
  }
  return out;
}

/** "rafael@gmail.com" → "ra****@gmail.com": o cliente reconhece o próprio e-mail sem que outra pessoa o descubra pelo CPF. */
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(user.length - visible.length, 3))}@${domain}`;
}

export const sameEmail = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Rascunhos parados há mais que isso são apagados: dado pessoal não fica guardado sem necessidade. */
export const DRAFT_TTL_DAYS = 30;
