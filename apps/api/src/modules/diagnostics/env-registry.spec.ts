import { ENV_VARS, environmentReport } from './env-registry';

describe('relatório de variáveis de ambiente', () => {
  it('mostra o que está definido sem expor valores', () => {
    const report = environmentReport({ DATABASE_URL: 'postgres://u:xK9-valor-confidencial@h/db', RESEND_API_KEY: '  ' });
    expect(report.variables.find(v => v.name === 'DATABASE_URL')).toMatchObject({ set: true, importance: 'required' });
    expect(report.variables.find(v => v.name === 'RESEND_API_KEY')?.set).toBe(false);
    expect(JSON.stringify(report)).not.toContain('xK9-valor-confidencial');
  });

  it('aponta variáveis que o código não lê, sugere o nome certo e ignora as do sistema', () => {
    const report = environmentReport({ SUPERFRETE_TOKEM: 'x', SHIPPING_ORIGIN_ZIPCODE: '1', MINHA_COISA: '1', RENDER_SERVICE_ID: 'a', NODE_VERSION: '22', PATH: '/bin', PORT: '10000', JWT_REFRESH_SECRET: 'y', MAIL_FROM: 'a@b.c' });
    expect(report.unrecognized.map(u => u.name)).toEqual(['JWT_REFRESH_SECRET', 'MINHA_COISA', 'SHIPPING_ORIGIN_ZIPCODE', 'SUPERFRETE_TOKEM']);
    expect(report.unrecognized.find(u => u.name === 'SUPERFRETE_TOKEM')?.suggestion).toBe('SUPERFRETE_TOKEN');
    expect(report.unrecognized.find(u => u.name === 'MINHA_COISA')?.suggestion).toBeNull();
  });

  it('não repete nomes no registro', () => {
    expect(new Set(ENV_VARS.map(v => v.name)).size).toBe(ENV_VARS.length);
  });
});
