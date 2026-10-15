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

/** Algoritmo de Luhn: pega número de cartão digitado errado antes de gastar uma chamada ao adquirente. */
export function isValidCardNumber(value: string) {
  const digits = onlyDigits(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  [...digits].reverse().forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  });
  return sum % 10 === 0;
}

const REDE_DECLINES: Record<string, string> = {
  '51': 'Saldo ou limite insuficiente no cartão.',
  '54': 'Cartão vencido. Confira a validade.',
  '14': 'Confira o número do cartão.',
  '82': 'Confira o código de segurança do cartão.',
  '57': 'Cartão sem permissão para esta compra. Fale com o banco ou use outro.',
  '62': 'Cartão restrito. Fale com o banco ou use outro.',
  '65': 'Limite de compras do cartão excedido hoje.',
};

/** Traduz o código de retorno da Rede; códigos desconhecidos viram a mensagem genérica de recusa. */
export const redeDeclineMessage = (code?: string | null) => (code && REDE_DECLINES[code]) || 'O cartão foi recusado. Confira os dados ou use outro meio de pagamento.';

/** Parcelas sem juros: valor mínimo por parcela, para o cliente não parcelar R$ 30 em 12x. */
export function installmentCount(total: number, max: number, minInstallment = Number(process.env.REDE_MIN_INSTALLMENT ?? 5)) {
  return Math.max(1, Math.min(max, Math.floor(total / Math.max(minInstallment, 0.01))));
}
