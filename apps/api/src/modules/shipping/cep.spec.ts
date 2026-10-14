import { STATES, stateFromZip } from './cep';

describe('stateFromZip', () => {
  it.each([
    ['01310-100', 'SP'], ['20040-020', 'RJ'], ['29010-000', 'ES'], ['30130-010', 'MG'], ['40020-000', 'BA'],
    ['49010-000', 'SE'], ['50030-000', 'PE'], ['57020-000', 'AL'], ['58010-000', 'PB'], ['59010-000', 'RN'],
    ['60060-000', 'CE'], ['64000-000', 'PI'], ['65010-000', 'MA'], ['66010-000', 'PA'], ['68900-000', 'AP'],
    ['69005-000', 'AM'], ['69301-000', 'RR'], ['69900-000', 'AC'], ['70040-000', 'DF'], ['73010-000', 'DF'],
    ['72800-000', 'GO'], ['74003-010', 'GO'], ['76801-000', 'RO'], ['77001-000', 'TO'], ['78005-000', 'MT'],
    ['79002-000', 'MS'], ['80010-000', 'PR'], ['88010-000', 'SC'], ['90010-000', 'RS'], ['69400000', 'AM'],
  ])('%s é %s', (zip, uf) => expect(stateFromZip(zip)).toBe(uf));

  it('rejeita CEP inválido ou fora das faixas', () => {
    expect(stateFromZip('1234')).toBeNull();
    expect(stateFromZip('00000-000')).toBeNull();
    expect(stateFromZip('abcdefgh')).toBeNull();
  });

  it('cobre as 27 UFs', () => expect(STATES).toHaveLength(27));
});
