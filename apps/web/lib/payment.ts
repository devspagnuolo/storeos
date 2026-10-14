import { apiUrl } from './api';

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

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

export const formatCardNumber = (value: string) => onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

/** "1227" ou "12/27" viram mês e ano de 4 dígitos; devolve undefined se a data for inválida ou vencida. */
export function parseExpiry(value: string, now = new Date()) {
  const d = onlyDigits(value);
  if (d.length !== 4) return undefined;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return undefined;
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return undefined;
  return { month, year };
}

export const formatExpiry = (value: string) => onlyDigits(value).slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2');

export type PaymentConfig = {
  card: { provider: 'mercadopago'; publicKey: string; maxInstallments: number } | { provider: 'rede'; maxInstallments: number; minInstallment: number } | null;
  boleto: boolean;
};

export async function getPaymentConfig(): Promise<PaymentConfig> {
  try {
    const response = await fetch(`${apiUrl}/payments/config`);
    return response.ok ? await response.json() : { card: null, boleto: false };
  } catch {
    return { card: null, boleto: false };
  }
}

type MercadoPagoSdk = {
  getPaymentMethods(input: { bin: string }): Promise<{ results: { id: string; issuer?: { id: string | number } }[] }>;
  getInstallments(input: { amount: string; bin: string }): Promise<{ payer_costs: { installments: number; installment_amount: number; total_amount: number; recommended_message: string }[]; issuer?: { id: string | number } }[]>;
  createCardToken(input: Record<string, string>): Promise<{ id: string }>;
};
declare global { interface Window { MercadoPago?: new (publicKey: string, options?: { locale: string }) => MercadoPagoSdk } }

let sdkLoading: Promise<void> | undefined;
/** Carrega o MP.js uma vez. Os dados do cartão vão direto do navegador ao Mercado Pago; só o token chega ao nosso servidor. */
export function loadMercadoPago(publicKey: string): Promise<MercadoPagoSdk> {
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    if (window.MercadoPago) return resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { sdkLoading = undefined; reject(new Error('Não foi possível carregar o pagamento por cartão.')); };
    document.head.appendChild(script);
  });
  return sdkLoading.then(() => new window.MercadoPago!(publicKey, { locale: 'pt-BR' }));
}

/** Parcelas sem juros da Rede: não deixa a parcela ficar abaixo do mínimo da loja. */
export const installmentCount = (total: number, max: number, minInstallment: number) => Math.max(1, Math.min(max, Math.floor(total / Math.max(minInstallment, 0.01))));
