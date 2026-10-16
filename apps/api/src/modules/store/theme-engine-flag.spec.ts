import { themeEngineEnabledFor } from './theme-engine-flag';

describe('themeEngineEnabledFor', () => {
  it('fica desligado por padrão', () => {
    expect(themeEngineEnabledFor('loja', undefined)).toBe(false);
    expect(themeEngineEnabledFor('loja', '')).toBe(false);
  });
  it('libera só as lojas piloto ou todas com *', () => {
    expect(themeEngineEnabledFor('loja', ' piloto , Loja ')).toBe(true);
    expect(themeEngineEnabledFor('outra', 'piloto,loja')).toBe(false);
    expect(themeEngineEnabledFor('outra', '*')).toBe(true);
  });
});
