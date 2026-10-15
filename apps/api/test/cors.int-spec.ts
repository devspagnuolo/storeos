import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanup, startApp } from './helpers';

let app: NestExpressApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.STORE_BASE_DOMAIN = 'lojas.exemplo.com.br';
  process.env.WEB_ORIGIN = 'https://principal.exemplo.com.br';
  ({ app } = await startApp());
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { delete process.env.STORE_BASE_DOMAIN; delete process.env.WEB_ORIGIN; await cleanup(app); });

const allowed = async (origin: string) => (await fetch(`${baseUrl}/api/v1/health`, { headers: { origin } })).headers.get('access-control-allow-origin');

describe('CORS', () => {
  it('libera a origem configurada e os subdomínios de loja, e nada além', async () => {
    expect(await allowed('https://principal.exemplo.com.br')).toBe('https://principal.exemplo.com.br');
    expect(await allowed('https://vivi.lojas.exemplo.com.br')).toBe('https://vivi.lojas.exemplo.com.br');
    expect(await allowed('http://vivi.lojas.exemplo.com.br')).toBeNull();
    expect(await allowed('https://a.b.lojas.exemplo.com.br')).toBeNull();
    expect(await allowed('https://lojasxexemplo.com.br')).toBeNull();
    expect(await allowed('https://vivi.lojas.exemplo.com.br.evil.com')).toBeNull();
    expect(await allowed('https://evil.com')).toBeNull();
  });
});
