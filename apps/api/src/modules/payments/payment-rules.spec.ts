import { clampInstallments, declineMessage, installmentProblem, simulateInstallments, storeInstallmentLimits, isValidCpf, maxAllowedInstallments, maxFreeInstallments, maxFreeInstallmentsForAmount, minFreeInstallment, onlyDigits } from './payment-rules';

describe('payment-rules', () => {
  it('valida CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('limita as parcelas entre 1 e 12', () => {
    expect(clampInstallments(0)).toBe(1);
    expect(clampInstallments('abc')).toBe(1);
    expect(clampInstallments(3.9)).toBe(3);
    expect(clampInstallments(40)).toBe(12);
    expect(clampInstallments(10, 6)).toBe(6);
  });

  it('aplica limites de parcelas configuráveis sem ultrapassar o máximo do gateway', () => {
    expect(maxAllowedInstallments('6')).toBe(6);
    expect(maxAllowedInstallments('99')).toBe(12);
    expect(maxAllowedInstallments('0')).toBe(1);
    expect(maxFreeInstallments('4', 6)).toBe(4);
    expect(maxFreeInstallments('9', 6)).toBe(6);
    expect(clampInstallments(10, maxAllowedInstallments('6'))).toBe(6);
  });

  it('calcula parcelas sem juros pelo piso por parcela', () => {
    expect(minFreeInstallment('80')).toBe(80);
    expect(minFreeInstallment()).toBe(80);
    expect(maxFreeInstallmentsForAmount(300, 6, 80)).toBe(3);
    expect(maxFreeInstallmentsForAmount(279.99, 6, 80)).toBe(3);
    expect(maxFreeInstallmentsForAmount(80, 6, 80)).toBe(1);
    expect(maxFreeInstallmentsForAmount(79.99, 6, 80)).toBe(1);
  });

  it('traduz a recusa do cartão sem vazar detalhe técnico', () => {
    expect(declineMessage('cc_rejected_insufficient_amount')).toMatch(/limite/);
    expect(declineMessage('algo_desconhecido')).toMatch(/recusado/);
    expect(declineMessage(null)).toMatch(/recusado/);
  });

  it('extrai dígitos', () => expect(onlyDigits('12.3-4')).toBe('1234'));

  describe('parcelamento no servidor', () => {
    const limits = { max: 6, maxFree: 3, minFree: 80 };
    const offers = [
      { installments: 1, installment_amount: 300, total_amount: 300 },
      { installments: 2, installment_amount: 150, total_amount: 300 },
      { installments: 3, installment_amount: 100, total_amount: 300 },
      { installments: 4, installment_amount: 80, total_amount: 320 },
      { installments: 6, installment_amount: 55, total_amount: 330 },
      { installments: 7, installment_amount: 50, total_amount: 350 },
    ];

    it('à vista sempre passa', () => expect(installmentProblem(1, 10, [], limits)).toBeNull());
    it('aceita sem juros dentro do limite e do piso', () => expect(installmentProblem(3, 300, offers, limits)).toBeNull());
    it('recusa sem juros acima do limite sem juros da loja', () => {
      const generous = offers.map(o => ({ ...o, total_amount: 300, installment_amount: 300 / o.installments }));
      expect(installmentProblem(4, 300, generous, limits)).toMatch(/não está disponível/);
    });
    it('recusa sem juros com parcela abaixo do piso', () => {
      expect(installmentProblem(3, 150, [{ installments: 3, installment_amount: 50, total_amount: 150 }], limits)).toMatch(/não está disponível/);
    });
    it('aceita parcela com juros paga pelo cliente até o máximo da loja', () => expect(installmentProblem(6, 300, offers, limits)).toBeNull());
    it('recusa acima do máximo da loja, mesmo que o gateway ofereça', () => expect(installmentProblem(7, 300, offers, limits)).toMatch(/máximo da loja é 6x/));
    it('recusa parcela que o gateway não oferece para o cartão', () => expect(installmentProblem(5, 300, offers, limits)).toMatch(/não está disponível/));
    it('sem a oferta do gateway só passa o que é sem juros pela regra da loja', () => {
      expect(installmentProblem(3, 300, undefined, limits)).toBeNull();
      expect(installmentProblem(4, 300, undefined, limits)).toMatch(/não está disponível/);
      expect(installmentProblem(2, 100, undefined, limits)).toMatch(/não está disponível/);
    });
  });
});

describe('regras de parcelamento da loja', () => {
  const platform = { max: 12, maxFree: 1, minFree: 80 };
  it('usa o que a loja salvou, dentro do teto da plataforma', () => {
    expect(storeInstallmentLimits({ maxInstallments: 10, maxFreeInstallments: 6, minFreeInstallment: 50 }, platform)).toEqual({ max: 10, maxFree: 6, minFree: 50 });
    expect(storeInstallmentLimits({ maxInstallments: 18, maxFreeInstallments: 15 }, platform)).toEqual({ max: 12, maxFree: 12, minFree: 80 });
    expect(storeInstallmentLimits({ maxInstallments: 3, maxFreeInstallments: 6 }, platform)).toEqual({ max: 3, maxFree: 3, minFree: 80 });
  });
  it('sem nada salvo segue o servidor', () => {
    expect(storeInstallmentLimits(null, platform)).toEqual(platform);
    expect(storeInstallmentLimits('lixo', platform)).toEqual(platform);
  });
  it('sem juros salvo na loja libera as parcelas sem juros do Mercado Pago', () => {
    const offers = [1, 3, 4].map(n => ({ installments: n, installment_amount: 300 / n, total_amount: 300 }));
    expect(installmentProblem(3, 300, offers, storeInstallmentLimits({ maxFreeInstallments: 3, minFreeInstallment: 80 }, platform))).toBeNull();
    expect(installmentProblem(4, 300, offers, storeInstallmentLimits({ maxFreeInstallments: 6, minFreeInstallment: 80 }, platform))).not.toBeNull();
  });
  it('simulação explica por que cada parcela aparece ou não', () => {
    const rows = simulateInstallments(300, [
      { installments: 1, installment_amount: 300, total_amount: 300 },
      { installments: 3, installment_amount: 100, total_amount: 300 },
      { installments: 5, installment_amount: 60, total_amount: 300 },
      { installments: 6, installment_amount: 54, total_amount: 324 },
    ], { max: 12, maxFree: 6, minFree: 80 });
    expect(rows.map(r => [r.installments, r.interestFree, r.shown])).toEqual([[1, true, true], [3, true, true], [5, true, false], [6, false, true]]);
    expect(rows[2].reason).toBe('parcela abaixo do mínimo sem juros');
  });
});
