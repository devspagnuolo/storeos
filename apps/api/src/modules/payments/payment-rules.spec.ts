import { clampInstallments, declineMessage, isValidCpf, onlyDigits } from './payment-rules';

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

  it('traduz a recusa do cartão sem vazar detalhe técnico', () => {
    expect(declineMessage('cc_rejected_insufficient_amount')).toMatch(/limite/);
    expect(declineMessage('algo_desconhecido')).toMatch(/recusado/);
    expect(declineMessage(null)).toMatch(/recusado/);
  });

  it('extrai dígitos', () => expect(onlyDigits('12.3-4')).toBe('1234'));
});
