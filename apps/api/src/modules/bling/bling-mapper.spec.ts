import { BlingCategory, byCode, isColorAttribute, meetsCodeFrom, productCodeNumber, blingText, normalizeVariants, categoryPath, contactPayload, OrderForBling, parseVariation, salesOrderPayload, toImportProduct } from './bling-mapper';

const categories = new Map<number, BlingCategory>([[1, { id: 1, descricao: 'Blusas' }], [2, { id: 2, descricao: 'Manga Longa', categoriaPai: { id: 1 } }], [3, { id: 3, descricao: 'Renda', categoriaPai: { id: 2 } }]]);

describe('bling-mapper', () => {
  it('limpa HTML das descrições', () => {
    expect(blingText('<p>Blusa <b>linda</b> &amp; leve</p><ul><li>Renda</li><li>Forro</li></ul>')).toBe('Blusa linda & leve\n• Renda\n• Forro');
    expect(blingText(undefined)).toBe('');
  });

  it('lê variações', () => {
    expect(parseVariation('Cor:Azul;Tamanho:M')).toEqual([{ name: 'Cor', value: 'Azul' }, { name: 'Tamanho', value: 'M' }]);
    expect(parseVariation('GG')).toEqual([{ name: 'Opção', value: 'GG' }]);
    expect(parseVariation('')).toEqual([]);
  });

  it('monta o caminho da categoria e resiste a ciclos', () => {
    expect(categoryPath(3, categories)).toEqual(['Blusas', 'Manga Longa', 'Renda']);
    expect(categoryPath(99, categories)).toEqual([]);
    const loop = new Map<number, BlingCategory>([[1, { id: 1, descricao: 'A', categoriaPai: { id: 2 } }], [2, { id: 2, descricao: 'B', categoriaPai: { id: 1 } }]]);
    expect(categoryPath(1, loop)).toEqual(['B', 'A']);
  });

  it('converte produto com variações, estoque, imagens e categoria', () => {
    const product = toImportProduct({
      id: 10, nome: 'Blusa de Renda', codigo: 'BR-1', preco: 99.9, situacao: 'A', descricaoComplementar: '<p>Linda</p>', pesoBruto: 0.3, largura: 20, altura: 5, profundidade: 25.4, categoria: { id: 3 },
      estoque: { saldoVirtualTotal: 0 }, midia: { imagens: { externas: [{ link: 'https://cdn.test/a.jpg' }, { link: 'http://inseguro.test/b.jpg' }] } },
      variacoes: [{ id: 11, codigo: 'BR-1-P', preco: 99.9, variacao: { nome: 'Tamanho:P' }, estoque: { saldoVirtualTotal: 4 } }, { id: 12, codigo: 'BR-1-G', preco: 109.9, variacao: { nome: 'Tamanho:G' }, estoque: { saldoVirtualTotal: -2 } }],
    }, categories, 1);
    expect(product).toMatchObject({
      slug: 'blusa-de-renda', sku: 'BR-1', price: 99.9, status: 'ACTIVE', description: 'Linda', categories: [['Blusas', 'Manga Longa', 'Renda']], weightGrams: 300, widthCm: 20, heightCm: 5, lengthCm: 25,
      imageUrls: ['https://cdn.test/a.jpg'],
      variants: [{ sku: 'BR-1-P', price: null, stock: 4, attributes: [{ name: 'Tamanho', value: 'P' }] }, { sku: 'BR-1-G', price: 109.9, stock: 0 }],
    });
  });

  it('traz NCM, CEST, origem, GTIN e unidade; descarta o que está fora do formato', () => {
    const base = { id: 1, nome: 'Blusa', codigo: 'B-1', preco: 10, situacao: 'A' };
    expect(toImportProduct({ ...base, gtin: '7891000100103', unidade: 'un', tributacao: { ncm: '6109.10.00', cest: '28.038.00', origem: 0 } }, categories, 1)).toMatchObject({ ncm: '61091000', cest: '2803800', taxOrigin: 0, gtin: '7891000100103', unit: 'UN' });
    const bad = toImportProduct({ ...base, gtin: '123', tributacao: { ncm: '12', origem: '9' } }, categories, 1);
    expect(bad).not.toHaveProperty('ncm');
    expect(bad).not.toHaveProperty('gtin');
    expect(bad).not.toHaveProperty('taxOrigin');
  });

  it('normaliza variações: rótulo ausente, atributos diferentes e combinações repetidas', () => {
    const v = (sku: string, label?: string, name?: string) => ({ sku, label, name, price: null, stock: 1 });
    // sem rótulo: usa o nome da variação sem o do produto
    expect(normalizeVariants('Blusa', [v('B-P', undefined, 'Blusa P'), v('B-M', undefined, 'Blusa M')]).map(x => x.attributes)).toEqual([[{ name: 'Opção', value: 'P' }], [{ name: 'Opção', value: 'M' }]]);
    // atributos diferentes entre variações viram uma opção só
    expect(normalizeVariants('Blusa', [v('1', 'Cor:Azul;Tamanho:M'), v('2', 'Tamanho:G')]).map(x => x.attributes[0].value)).toEqual(['Azul / M', 'G']);
    // combinação repetida ganha o SKU
    expect(normalizeVariants('Blusa', [v('1', 'Cor:Azul'), v('2', 'Cor:Azul')]).map(x => x.attributes[0].value)).toEqual(['Azul', 'Azul (2)']);
  });

  it('recusa produto sem SKU e desambigua slug repetido', () => {
    expect(toImportProduct({ id: 1, nome: 'X' }, categories, 1)).toEqual({ error: 'X: sem código (SKU) no Bling' });
    const second = toImportProduct({ id: 2, nome: 'Blusa', codigo: 'B-2', situacao: 'I' }, categories, 1, slug => slug === 'blusa');
    expect(second).toMatchObject({ slug: 'blusa-b-2', status: 'DRAFT' });
  });

  const order: OrderForBling = {
    number: 'SO-1', createdAt: new Date('2026-10-14T15:00:00Z'), subtotal: 200, discount: 10, promotionDiscount: 5, shipping: 20, total: 205, shippingMethod: 'PAC', couponCode: 'VIVI10', paymentMethod: 'PIX',
    address: { zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' },
    customer: { name: 'Maria Silva', email: 'maria@example.com', document: '529.982.247-25', phone: null },
    items: [{ sku: 'BR-1-P', name: 'Blusa de Renda P', quantity: 2, unitPrice: 100 }],
  };

  it('monta o contato com CPF só em dígitos', () => {
    expect(contactPayload(order)).toMatchObject({ nome: 'Maria Silva', tipo: 'F', numeroDocumento: '52998224725', endereco: { geral: { cep: '01310100', uf: 'SP' } } });
    expect(contactPayload({ ...order, customer: { ...order.customer, document: '11222333000181' } }).tipo).toBe('J');
  });

  it('monta o pedido de venda com itens, desconto, frete e número da loja', () => {
    const payload = salesOrderPayload(order, 77, new Map([['br-1-p', 555]]));
    expect(payload).toMatchObject({
      numeroLoja: 'SO-1', data: '2026-10-14', contato: { id: 77 }, desconto: { valor: 15, unidade: 'REAL' },
      itens: [{ produto: { id: 555 }, codigo: 'BR-1-P', quantidade: 2, valor: 100 }], transporte: { frete: 20, etiqueta: { cep: '01310100' } },
    });
    expect(payload.observacoes).toContain('Cupom: VIVI10');
    expect(salesOrderPayload({ ...order, discount: 0, promotionDiscount: 0 }, 1, new Map())).not.toHaveProperty('desconto');
    expect(salesOrderPayload(order, 1, new Map()).itens[0]).not.toHaveProperty('produto');
  });
});

describe('código mínimo dos produtos do Bling', () => {
  it('compara o número do início do código', () => {
    expect(productCodeNumber('2456')).toBe(2456);
    expect(productCodeNumber(' 2456-P ')).toBe(2456);
    expect(productCodeNumber('BR-1')).toBeNull();
    expect(productCodeNumber(undefined)).toBeNull();
    expect(meetsCodeFrom('1500', 1500)).toBe(true);
    expect(meetsCodeFrom('1499', 1500)).toBe(false);
    expect(meetsCodeFrom('', 1500)).toBe(false);
    expect(meetsCodeFrom('0010', 0)).toBe(true);
  });
});

describe('byCode', () => {
  it('orders Bling products by code, ascending', () => {
    const rows = ['1502', '1500-B', '1510', 'SEM', '1500', '1501', '1500-A'].map(codigo => ({ codigo }));
    expect(rows.sort(byCode).map(r => r.codigo)).toEqual(['1500', '1500-A', '1500-B', '1501', '1502', '1510', 'SEM']);
  });
});

describe('colorImages', () => {
  it('pega as fotos da primeira variação de cada cor', () => {
    const media = (link: string) => ({ imagens: { externas: [{ link }] } });
    const detail = { id: 1, nome: 'Vestido', codigo: '1800', variacoes: [
      { id: 2, codigo: '1801', variacao: { nome: 'Cor:Preto;Tamanho:G' }, midia: media('https://cdn.test/p.jpg') },
      { id: 3, codigo: '1802', variacao: { nome: 'Cor:Preto;Tamanho:GG' }, midia: media('https://cdn.test/p2.jpg') },
      { id: 4, codigo: '1803', variacao: { nome: 'Cor:Marrom;Tamanho:G' } },
      { id: 5, codigo: '1804', variacao: { nome: 'Cor:Marrom;Tamanho:GG' }, midia: media('https://cdn.test/m.jpg') },
    ] };
    const product = toImportProduct(detail, new Map(), 1);
    expect('error' in product ? product : product.colorImages).toEqual([{ color: 'Preto', urls: ['https://cdn.test/p.jpg'] }, { color: 'Marrom', urls: ['https://cdn.test/m.jpg'] }]);
    expect(isColorAttribute('Tamanho')).toBe(false);
    expect(['Cor', 'cores', 'Color'].every(isColorAttribute)).toBe(true);
  });
});
