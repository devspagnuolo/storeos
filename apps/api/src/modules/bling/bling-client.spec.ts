import { describeError } from './bling.client';

describe('describeError', () => {
  it('names the Bling resource missing from the app scopes', () => {
    const message = describeError(403, { error: { type: 'FORBIDDEN', message: 'insufficient_scope' } }, 'POST /contatos');
    expect(message).toContain('insufficient_scope');
    expect(message).toContain('gravar Contatos');
    expect(describeError(403, { error: { message: 'insufficient_scope' } }, 'GET /pedidos/vendas?numerosLojas%5B%5D=1')).toContain('ler Pedidos de venda');
  });

  it('keeps the Bling message and invalid fields for other errors', () => {
    expect(describeError(400, { error: { message: 'Dados inválidos', fields: [{ element: 'contato', msg: 'obrigatório' }] } }, 'POST /pedidos/vendas')).toBe('Bling 400: Dados inválidos – contato: obrigatório');
  });
});
