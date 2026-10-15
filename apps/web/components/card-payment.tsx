'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { formatPrice } from '../lib/format';
import { formatCardNumber, formatExpiry, isEligibleFreeInstallment, loadMercadoPago, onlyDigits, parseExpiry, PaymentConfig } from '../lib/payment';

export type CardPayload = { installments: number; token: string; paymentMethodId: string; issuerId?: string; bin: string };
export type CardPaymentHandle = { tokenize(cpf: string): Promise<CardPayload> };
type Option = { installments: number; label: string };

const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal';

export const CardPayment = forwardRef<CardPaymentHandle, { config: NonNullable<PaymentConfig['card']>; amount: number; cpf: string }>(function CardPayment({ config, amount, cpf }, ref) {
  const publicKey = config.publicKey;
  const maxInstallments = config.maxInstallments;
  const maxFreeInstallments = config.maxFreeInstallments;
  const minFreeInstallment = config.minFreeInstallment;
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [options, setOptions] = useState<Option[]>([{ installments: 1, label: `1x de ${formatPrice(amount)}` }]);
  const [installments, setInstallments] = useState(1);
  const sdk = useRef<Awaited<ReturnType<typeof loadMercadoPago>> | undefined>(undefined);
  const method = useRef<{ id: string; issuerId?: string } | undefined>(undefined);
  const [sdkError, setSdkError] = useState<string>();
  const bin = onlyDigits(number).slice(0, 8);

  useEffect(() => { loadMercadoPago(publicKey).then(instance => { sdk.current = instance; }).catch(e => setSdkError((e as Error).message)); }, [publicKey]);

  const refreshInstallments = useCallback(async () => {
    if (!sdk.current || bin.length < 6) return;
    try {
      const methods = await sdk.current.getPaymentMethods({ bin: bin.slice(0, 6) });
      const found = methods.results[0];
      if (!found) return;
      const [info] = await sdk.current.getInstallments({ amount: amount.toFixed(2), bin: bin.slice(0, 6) });
      method.current = { id: found.id, issuerId: info?.issuer?.id ? String(info.issuer.id) : found.issuer?.id ? String(found.issuer.id) : undefined };
      const costs = (info?.payer_costs ?? []).filter(cost => {
        if (cost.installments > maxInstallments) return false;
        const interestFree = cost.total_amount <= amount + 0.005;
        return !interestFree || isEligibleFreeInstallment(cost.installments, cost.installment_amount, maxFreeInstallments, minFreeInstallment);
      });
      if (costs.length) {
        setOptions(costs.map(cost => ({ installments: cost.installments, label: `${cost.installments}x de ${formatPrice(cost.installment_amount)}${cost.total_amount > amount + 0.005 ? ` (total ${formatPrice(cost.total_amount)})` : ' sem juros'}` })));
        setInstallments(current => (costs.some(cost => cost.installments === current) ? current : 1));
      }
    } catch {
      // Sem as opções do gateway, o cliente ainda pode pagar à vista.
    }
  }, [bin, amount, maxInstallments, maxFreeInstallments, minFreeInstallment]);

  useEffect(() => { void refreshInstallments(); }, [refreshInstallments]);

  useImperativeHandle(ref, () => ({
    async tokenize(cpfValue: string) {
      const valid = parseExpiry(expiry);
      if (onlyDigits(number).length < 13 || !holder.trim() || !valid || cvv.length < 3) throw new Error('Confira os dados do cartão.');
      if (!sdk.current) throw new Error(sdkError ?? 'O pagamento por cartão ainda está carregando. Tente de novo.');
      if (!method.current) await refreshInstallments();
      if (!method.current) throw new Error('Não reconhecemos este cartão. Confira o número.');
      const token = await sdk.current.createCardToken({
        cardNumber: onlyDigits(number), cardholderName: holder.trim(), cardExpirationMonth: String(valid.month).padStart(2, '0'), cardExpirationYear: String(valid.year), securityCode: cvv,
        identificationType: 'CPF', identificationNumber: onlyDigits(cpfValue || cpf),
      }).catch(() => { throw new Error('Não foi possível validar o cartão. Confira os dados.'); });
      return { token: token.id, paymentMethodId: method.current.id, issuerId: method.current.issuerId, bin: bin.slice(0, 6), installments };
    },
  }), [number, holder, expiry, cvv, installments, sdkError, cpf, refreshInstallments, bin]);

  return (
    <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
      {sdkError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{sdkError}</p>}
      <label className="text-sm font-medium sm:col-span-2">Número do cartão
        <input value={number} onChange={e => setNumber(formatCardNumber(e.target.value))} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" className={input} required />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Nome impresso no cartão
        <input value={holder} onChange={e => setHolder(e.target.value.toUpperCase())} autoComplete="cc-name" className={input} required />
      </label>
      <label className="text-sm font-medium">Validade
        <input value={expiry} onChange={e => setExpiry(formatExpiry(e.target.value))} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" className={input} required />
      </label>
      <label className="text-sm font-medium">Código de segurança
        <input value={cvv} onChange={e => setCvv(onlyDigits(e.target.value).slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" className={input} required />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Parcelas
        <select value={installments} onChange={e => setInstallments(Number(e.target.value))} className={input}>
          {options.map(option => <option key={option.installments} value={option.installments}>{option.label}</option>)}
        </select>
      </label>
      <p className="text-xs text-slate-500 sm:col-span-2">Pagamento processado pelo Mercado Pago. O parcelamento sem juros exige parcela mínima de {formatPrice(minFreeInstallment)} e respeita as opções disponíveis para este cartão.</p>
    </div>
  );
});
