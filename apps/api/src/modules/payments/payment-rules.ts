export const onlyDigits = (value: string) => value.replace(/\D/g, '');

 /** Valida os dígitos verificadores do CPF; sequências repetidas (111.111.111-11) não valem. */
export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export const MAX_INSTALLMENTS = 12;

/** Limite configurado no servidor, sempre restrito ao máximo permitido pelo gateway. */
export function maxAllowedInstallments(value: unknown = process.env.MERCADOPAGO_MAX_INSTALLMENTS) {
  const parsed = Number(value ?? MAX_INSTALLMENTS);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.trunc(parsed), MAX_INSTALLMENTS)) : MAX_INSTALLMENTS;
}

/** Máximo de parcelas sem juros que a loja aceita apresentar, dentro do limite geral. */
export function maxFreeInstallments(value: unknown = process.env.MERCADOPAGO_MAX_FREE_INSTALLMENTS, max = maxAllowedInstallments()) {
  const parsed = Number(value ?? 1);
  const configured = Number.isFinite(parsed) ? Math.max(1, Math.min(Math.trunc(parsed), MAX_INSTALLMENTS)) : 1;
  return Math.min(configured, maxAllowedInstallments(max));
}

/** Piso em reais por parcela sem juros. */
export function minFreeInstallment(value: unknown = process.env.MERCADOPAGO_MIN_FREE_INSTALLMENT) {
  const parsed = Number(value ?? 80);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 100_000) : 80;
}

/** Limite sem juros aplicável a um pedido, respeitando valor mínimo e limite de parcelas da loja. */
export function maxFreeInstallmentsForAmount(amount: number, max = maxFreeInstallments(), minimum = minFreeInstallment()) {
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  if (amount < minimum) return 1; // pagamento à vista continua disponível
  return Math.max(1, Math.min(max, Math.floor((amount + 0.000001) / Math.max(minimum, 0.01))));
}

/** Parcelas pedidas pelo cliente: inteiro entre 1 e o máximo configurado para a loja. */
export function clampInstallments(value: unknown, max = maxAllowedInstallments()) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, Math.min(max, MAX_INSTALLMENTS));
}

const DECLINES: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão.',
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança do cartão.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_call_for_authorize: 'Seu banco pede autorização: ligue para ele e tente de novo.',
  cc_rejected_card_disabled: 'Cartão desativado. Ative-o com o banco ou use outro.',
  cc_rejected_duplicated_payment: 'Você já fez um pagamento igual a este.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Use outro cartão.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Tente outro meio de pagamento.',
};

/** Mensagem amigável para um cartão recusado; o detalhe técnico do gateway nunca vai ao cliente. */
export const declineMessage = (detail?: string | null) => (detail && DECLINES[detail]) || 'O cartão foi recusado. Confira os dados ou use outro meio de pagamento.';

/** Uma opção de parcelamento devolvida pelo Mercado Pago para o cartão e o valor do pedido. */
export type InstallmentOffer = { installments: number; installment_amount: number; total_amount: number };

export type InstallmentLimits = { max: number; maxFree: number; minFree: number };
export const currentInstallmentLimits = (): InstallmentLimits => ({ max: maxAllowedInstallments(), maxFree: maxFreeInstallments(), minFree: minFreeInstallment() });

/** Regras de parcelamento salvas pelo lojista no painel (Store.paymentRules). */
export type StoredPaymentRules = { maxInstallments?: number; maxFreeInstallments?: number; minFreeInstallment?: number };

const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined);

/**
 * Limites de uma loja: o que ela salvou no painel, dentro do teto da plataforma (MERCADOPAGO_MAX_INSTALLMENTS).
 * O que a loja não preencheu segue as variáveis do servidor.
 */
export function storeInstallmentLimits(stored: unknown, platform: InstallmentLimits = currentInstallmentLimits()): InstallmentLimits {
  const rules = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as StoredPaymentRules : {};
  const max = Math.max(1, Math.min(whole(rules.maxInstallments) ?? platform.max, platform.max));
  const maxFree = Math.max(1, Math.min(whole(rules.maxFreeInstallments) ?? platform.maxFree, max));
  const minFree = typeof rules.minFreeInstallment === 'number' && Number.isFinite(rules.minFreeInstallment) && rules.minFreeInstallment >= 0 ? Math.min(rules.minFreeInstallment, 100_000) : platform.minFree;
  return { max, maxFree, minFree };
}

/** Uma linha da simulação do painel: o que o Mercado Pago cobra e o que o checkout desta loja mostra. */
export type SimulationRow = { installments: number; installmentAmount: number; totalAmount: number; interestFree: boolean; shown: boolean; reason: string | null };

/** Compara a oferta real do Mercado Pago com as regras da loja, parcela a parcela. */
export function simulateInstallments(amount: number, offers: InstallmentOffer[], limits: InstallmentLimits): SimulationRow[] {
  return offers.filter(offer => offer.installments >= 1).sort((a, b) => a.installments - b.installments).map(offer => {
    const interestFree = offer.total_amount <= amount + 0.005;
    const reason = offer.installments > limits.max ? `acima do máximo de ${limits.max}x da loja`
      : offer.installments > 1 && interestFree && offer.installments > limits.maxFree ? `sem juros só até ${limits.maxFree}x`
      : offer.installments > 1 && interestFree && offer.installment_amount + 0.000001 < limits.minFree ? 'parcela abaixo do mínimo sem juros'
      : null;
    return { installments: offer.installments, installmentAmount: offer.installment_amount, totalAmount: offer.total_amount, interestFree, shown: reason === null, reason };
  });
}

/**
 * Regra de parcelamento aplicada no servidor, a mesma que o checkout mostra ao cliente.
 * Com a oferta real do Mercado Pago: a parcela precisa existir para o cartão; parcelas com juros (pagas pelo cliente) valem até o máximo da loja;
 * parcelas sem juros (pagas pela loja) respeitam o limite sem juros e o piso por parcela.
 * Sem a oferta (consulta indisponível), só passa o que é garantidamente sem juros pela regra da loja.
 * Devolve a mensagem para o cliente, ou null se o parcelamento é válido.
 */
export function installmentProblem(requested: number, total: number, offers: InstallmentOffer[] | undefined, limits: InstallmentLimits = currentInstallmentLimits()): string | null {
  if (requested <= 1) return null;
  if (requested > limits.max) return `O parcelamento máximo da loja é ${limits.max}x.`;
  const unavailable = 'Esse parcelamento não está disponível para este cartão. Escolha outro número de parcelas.';
  if (!offers) return requested <= maxFreeInstallmentsForAmount(total, limits.maxFree, limits.minFree) ? null : unavailable;
  const offer = offers.find(o => o.installments === requested);
  if (!offer) return unavailable;
  const interestFree = offer.total_amount <= total + 0.005;
  if (!interestFree) return null;
  return requested <= limits.maxFree && offer.installment_amount + 0.000001 >= limits.minFree ? null : unavailable;
}
