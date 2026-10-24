import { NestExpressApplication } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { PhotoroomClient } from '../src/modules/media/photoroom.client';
import { cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];
let baseUrl: string;

/** Photoroom falso: devolve a foto inteira transparente com um quadrado no meio, como um recorte. */
const photoroom = {
  configured: true,
  sandbox: false,
  calls: 0,
  async removeBackground() {
    this.calls++;
    const piece = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    return sharp({ create: { width: 800, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: piece, left: 300, top: 400 }]).png().toBuffer();
  },
};

beforeAll(async () => {
  process.env.API_PUBLIC_URL = 'https://api.example.test';
  ({ app, api } = await startApp(builder => builder.overrideProvider(PhotoroomClient).useValue(photoroom)));
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { delete process.env.API_PUBLIC_URL; await cleanup(app); });

const jpeg = () => sharp({ create: { width: 800, height: 1000, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();
async function upload(token: string, data: Buffer) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), 'vestido.jpg');
  const response = await fetch(`${baseUrl}/api/v1/media/upload?kind=product`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}
const corner = async (url: string) => {
  const served = await fetch(url.replace('https://api.example.test', baseUrl));
  return [...await sharp(Buffer.from(await served.arrayBuffer())).extract({ left: 3, top: 3, width: 1, height: 1 }).raw().toBuffer()];
};

describe('fundo padrão das fotos de produto', () => {
  it('desligado por padrão: o envio continua como antes e nada é recortado', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write', 'catalog.write']);
    expect((await api('/media/background', { token })).body).toEqual({ enabled: false, color: '#F2F2F2', style: 'studio', imageUrl: null, shadow: true, floor: 0.88, available: true, sandbox: false });
    const before = photoroom.calls;
    const sent = await upload(token, await jpeg());
    expect(sent.status).toBe(201);
    expect(sent.body.files[0].originalUrl).toBeUndefined();
    expect(photoroom.calls).toBe(before);
  });

  it('ligado: troca o fundo das fotos novas, guarda a original e permite voltar', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write', 'catalog.write']);
    expect((await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: '#E8E0D0', style: 'flat', shadow: false } })).body).toMatchObject({ enabled: true, color: '#E8E0D0', style: 'flat' });
    const sent = await upload(token, await jpeg());
    expect(sent.status).toBe(201);
    const [photo] = sent.body.files;
    expect(photo).toMatchObject({ width: 1000, height: 1250, warning: null });
    expect(photo.originalUrl).toMatch(/\/api\/v1\/media\//);
    const [r, g, b] = await corner(photo.url);
    expect(Math.abs(r - 0xe8) + Math.abs(g - 0xe0) + Math.abs(b - 0xd0)).toBeLessThan(12);
    const [or, , ob] = await corner(photo.originalUrl);
    expect(ob).toBeGreaterThan(or); // a original continua azul
    expect((await api('/media/background/originals', { method: 'POST', token, body: { urls: [photo.url, photo.originalUrl] } })).body).toEqual({ [photo.url]: photo.originalUrl });

    const again = await api('/media/background/apply', { method: 'POST', token, body: { url: photo.url } });
    expect(again.status).toBe(200);
    expect(again.body.originalUrl).toBe(photo.originalUrl);
  });

  it('prévia sem gastar crédito e imagem de fundo enviada pela loja', async () => {
    const { store } = await createStore();
    const token = await login(api, store, ['settings.write', 'catalog.write']);
    const before = photoroom.calls;
    const preview = await fetch(`${baseUrl}/api/v1/media/background/preview`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ style: 'studio', color: '#F6E9EC', shadow: true }) });
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toContain('image/jpeg');
    expect((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width).toBe(400);
    expect(photoroom.calls).toBe(before);

    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(await sharp({ create: { width: 600, height: 400, channels: 3, background: '#20a060' } }).jpeg().toBuffer())], { type: 'image/jpeg' }), 'parede.jpg');
    const wall = (await (await fetch(`${baseUrl}/api/v1/media/upload?kind=other`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } })).json()).files[0].url;
    expect((await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: '#FFFFFF', style: 'image' } })).status).toBe(400);
    expect((await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: '#FFFFFF', style: 'image', imageUrl: wall, shadow: false } })).body).toMatchObject({ style: 'image', imageUrl: wall });
    const [photo] = (await upload(token, await jpeg())).body.files;
    const [r, g] = await corner(photo.url);
    expect(g).toBeGreaterThan(r + 60); // a parede verde aparece atrás da peça
    expect((await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: '#FFFFFF', style: 'image', imageUrl: 'https://outra.test/x.jpg' } })).status).toBe(400);
  });

  it('só trata fotos da própria loja e valida a cor', async () => {
    const { store } = await createStore();
    const { store: other } = await createStore();
    const token = await login(api, store, ['settings.write', 'catalog.write']);
    const otherToken = await login(api, other, ['catalog.write']);
    await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: '#FFFFFF' } });
    const [photo] = (await upload(token, await jpeg())).body.files;
    expect((await api('/media/background/apply', { method: 'POST', token: otherToken, body: { url: photo.originalUrl } })).status).toBe(400);
    expect((await api('/media/background/originals', { method: 'POST', token: otherToken, body: { urls: [photo.url] } })).body).toEqual({});
    expect((await api('/media/background', { method: 'PUT', token, body: { enabled: true, color: 'vermelho' } })).status).toBe(400);
    expect((await api('/media/background', { method: 'PUT', token: otherToken, body: { enabled: true, color: '#FFFFFF' } })).status).toBe(403);
    expect(await prisma.photoOriginal.count({ where: { storeId: other.id } })).toBe(0);
  });
});
