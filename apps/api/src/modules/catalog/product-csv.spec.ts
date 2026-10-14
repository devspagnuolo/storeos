import { parseCategories, parseCsv, parseNumber, parseProducts } from './product-csv';

const nuvem = [
  'Identificador URL;Nome;Categorias;Nome da variação 1;Valor da variação 1;Nome da variação 2;Valor da variação 2;Preço;Preço promocional;Peso (kg);Altura (cm);Largura (cm);Comprimento (cm);Estoque;SKU;Exibir na loja;Descrição;Marca',
  'blusa-ciganinha;Blusa Ciganinha;"Blusas > Regatas, Promoção";Cor;Preto;Tamanho;G1;"89,90";"69,90";0,3;5;25;30;4;BL-P-G1;SIM;"Linda; com ""detalhe""";Vivi',
  'blusa-ciganinha;;;Cor;Preto;Tamanho;G2;"89,90";;;;;;0;BL-P-G2;SIM;;',
  'blusa-ciganinha;;;Cor;Branco;Tamanho;G1;"94,90";;;;;;7;;SIM;;',
  'cinto-fino;Cinto Fino;Acessórios;;;;;"1.234,50";;;;;;12;CINTO-1;NÃO;;',
].join('\r\n');

describe('parseCsv', () => {
  it('lê aspas, separador dentro de aspas, BOM e quebra de linha em célula', () => {
    expect(parseCsv('﻿a,b\n"x,1","y\nz"\n')).toEqual([['a', 'b'], ['x,1', 'y\nz']]);
  });
  it('detecta ponto e vírgula e tabulação', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseNumber e parseCategories', () => {
  it('entende preços brasileiros', () => {
    expect([parseNumber('R$ 1.234,56'), parseNumber('49,90'), parseNumber('49.90'), parseNumber(''), parseNumber('abc')]).toEqual([1234.56, 49.9, 49.9, undefined, undefined]);
  });
  it('separa categorias e subcategorias', () => {
    expect(parseCategories('Blusas > Regatas, Promoção | Outlet > A > B')).toEqual([['Blusas', 'Regatas'], ['Promoção'], ['Outlet', 'A']]);
  });
});

describe('parseProducts (formato Nuvemshop)', () => {
  const { products, errors, rows } = parseProducts(nuvem);
  it('agrupa as linhas de variações no mesmo produto', () => {
    expect(errors).toEqual([]);
    expect(rows).toBe(4);
    expect(products.map(p => p.slug)).toEqual(['blusa-ciganinha', 'cinto-fino']);
    const blusa = products[0];
    expect(blusa).toMatchObject({ name: 'Blusa Ciganinha', price: 69.9, brand: 'Vivi', weightGrams: 300, heightCm: 5, widthCm: 25, lengthCm: 30, status: 'ACTIVE', stock: 0, description: 'Linda; com "detalhe"' });
    expect(blusa.categories).toEqual([['Blusas', 'Regatas'], ['Promoção']]);
    expect(blusa.variants).toEqual([
      { sku: 'BL-P-G1', attributes: [{ name: 'Cor', value: 'Preto' }, { name: 'Tamanho', value: 'G1' }], price: 69.9, stock: 4 },
      { sku: 'BL-P-G2', attributes: [{ name: 'Cor', value: 'Preto' }, { name: 'Tamanho', value: 'G2' }], price: 89.9, stock: 0 },
      { sku: 'BLUSA-CIGANINHA-3', attributes: [{ name: 'Cor', value: 'Branco' }, { name: 'Tamanho', value: 'G1' }], price: 94.9, stock: 7 },
    ]);
  });
  it('usa o preço promocional quando menor e o menor preço das variações como preço do produto', () => {
    expect(products[0].price).toBe(69.9);
  });
  it('produto simples com estoque, SKU e oculto na loja', () => {
    expect(products[1]).toMatchObject({ sku: 'CINTO-1', price: 1234.5, stock: 12, status: 'DRAFT', variants: [] });
  });
});

describe('parseProducts (erros)', () => {
  it('relata produto sem preço, variações repetidas e planilha sem coluna de nome', () => {
    const csv = 'Nome;Preço;Valor da variação 1;SKU\nSem preço;;;\nVaso;10;Azul;A\nVaso;10;Azul;B';
    const { products, errors } = parseProducts(csv);
    expect(products).toEqual([]);
    expect(errors.map(e => e.message)).toEqual(['Produto "Sem preço" sem preço', 'Produto "Vaso" tem variações repetidas']);
    expect(parseProducts('Preço\n10').errors[0].message).toContain('coluna "Nome"');
    expect(parseProducts('Nome').errors[0].message).toContain('vazia');
  });
});
