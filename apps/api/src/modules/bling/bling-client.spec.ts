import { BlingClient, describeError } from './bling.client';

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

describe('BlingClient.request', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.useRealTimers(); });
  const reply = (status: number, body: unknown) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) }) as unknown as Response;

  it('waits and retries when Bling answers 429, then returns the data', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockResolvedValueOnce(reply(429, { error: { message: 'Limite de requisições atingido.' } })).mockResolvedValueOnce(reply(200, { data: [1] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const pending = new BlingClient().request<{ data: number[] }>('token', '/produtos');
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({ data: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up with the 429 error after the retries', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockResolvedValue(reply(429, { error: { message: 'Limite de requisições atingido.' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const pending = new BlingClient().request('token', '/produtos');
    const outcome = expect(pending).rejects.toMatchObject({ status: 429 });
    await jest.advanceTimersByTimeAsync(10_000);
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
