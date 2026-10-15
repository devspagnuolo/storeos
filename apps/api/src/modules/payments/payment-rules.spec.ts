import { clampInstallments, declineMessage, installmentCount, isValidCardNumber, isValidCpf, maxAllowedInstallments, maxFreeInstallments, maxFreeInstallmentsForAmount, minFreeInstallment, onlyDigits, redeDeclineMessage } from './payment-rules';

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
    expect(minFreeInstallment('70')).toBe(70);
    expect(minFreeInstallment()).toBe(70);
    expect(maxFreeInstallmentsForAmount(300, 6, 70)).toBe(4);
    expect(maxFreeInstallmentsForAmount(279.99, 6, 70)).toBe(3);
    expect(maxFreeInstallmentsForAmount(70, 6, 70)).toBe(1);
    expect(maxFreeInstallmentsForAmount(69.99, 6, 70)).toBe(1);
  });

  it('traduz a recusa do cartão sem vazar detalhe técnico', () => {
    expect(declineMessage('cc_rejected_insufficient_amount')).toMatch(/limite/);
    expect(declineMessage('algo_desconhecido')).toMatch(/recusado/);
    expect(declineMessage(null)).toMatch(/recusado/);
  });

  it('extrai dígitos', () => expect(onlyDigits('12.3-4')).toBe('1234'));

  it('valida número de cartão com Luhn', () => {
    expect(isValidCardNumber('4235 6477 2802 5682')).toBe(true);
    expect(isValidCardNumber('4235647728025683')).toBe(false);
    expect(isValidCardNumber('1234')).toBe(false);
  });

  it('traduz retornos da Rede', () => {
    expect(redeDeclineMessage('51')).toMatch(/limite/);
    expect(redeDeclineMessage('99')).toMatch(/recusado/);
  });

  it('limita parcelas pelo valor mínimo', () => {
    expect(installmentCount(30, 12, 5)).toBe(6);
    expect(installmentCount(300, 12, 5)).toBe(12);
    expect(installmentCount(3, 12, 5)).toBe(1);
  });
});
