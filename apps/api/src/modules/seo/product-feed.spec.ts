import { buildFeedItems, buildGoogleXml, buildMetaCsv, feedIssues, FeedProduct } from './product-feed';

const dress: FeedProduct = {
  id: 'p1', name: 'Vestido <Midi>', slug: 'vestido-midi', sku: 'VM', description: '<p>Vestido leve & confortável para o dia a dia.</p>', price: '129.9', gtin: null,
  brand: 'Vivi', category: 'Vestidos', images: ['/media/a.jpg', 'https://cdn.example.com/b.jpg'], available: 0,
  variants: [
    { sku: 'VM-P', price: null, gtin: '7891000100103', attributes: [{ name: 'Cor', value: 'Azul' }, { name: 'Tamanho', value: '46' }], available: 3 },
    { sku: 'VM-G', price: '139.90', gtin: null, attributes: [{ name: 'Cor', value: 'Azul' }, { name: 'Tamanho', value: '50' }], available: 0 },
  ],
};
const simple: FeedProduct = { id: 'p2', name: 'Cinto', slug: 'cinto', sku: 'CT', description: null, price: '40', gtin: null, brand: null, category: null, images: [], variants: [], available: 5 };

describe('vitrine de produtos', () => {
  const items = buildFeedItems([dress, simple], 'https://loja.example.com/');
  it('gera uma linha por variação com preço, cor e tamanho', () => {
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: 'VM-P', groupId: 'VM', price: '129.90', availability: 'in stock', color: 'Azul', size: '46', gtin: '7891000100103', link: 'https://loja.example.com/produto/vestido-midi', image: 'https://loja.example.com/media/a.jpg', title: 'Vestido <Midi> - Azul / 46' });
    expect(items[1]).toMatchObject({ id: 'VM-G', price: '139.90', availability: 'out of stock', gtin: null });
    expect(items[2]).toMatchObject({ id: 'CT', groupId: null, availability: 'in stock' });
  });
  it('limpa HTML da descrição', () => {
    expect(items[0].description).toBe('Vestido leve & confortável para o dia a dia.');
  });
  it('monta o XML do Google escapando texto e pulando produto sem foto', () => {
    const out = buildGoogleXml(items, { name: 'Vivi & Cia', site: 'https://loja.example.com' });
    expect(out).toContain('<title>Vivi &amp; Cia</title>');
    expect(out).toContain('<title>Vestido &lt;Midi&gt; - Azul / 46</title>');
    expect(out).toContain('<g:price>129.90 BRL</g:price>');
    expect(out).toContain('<g:additional_image_link>https://cdn.example.com/b.jpg</g:additional_image_link>');
    expect(out).toContain('<g:identifier_exists>no</g:identifier_exists>');
    expect(out).not.toContain('<g:id>CT</g:id>');
  });
  it('monta a planilha do Meta com aspas quando preciso', () => {
    const csv = buildMetaCsv(items).split('\n');
    expect(csv[0].startsWith('id,title,description')).toBe(true);
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain('VM-P,Vestido <Midi> - Azul / 46,');
    expect(csv[1]).toContain('129.90 BRL');
  });
  it('aponta o que falta em cada produto', () => {
    expect(feedIssues(dress)).toEqual(['no-gtin']);
    expect(feedIssues(simple)).toEqual(['no-photo', 'no-gtin', 'no-brand', 'no-description']);
  });
});
