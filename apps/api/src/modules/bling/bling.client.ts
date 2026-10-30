import { Injectable } from '@nestjs/common';

const API = 'https://api.bling.com.br/Api/v3';
// O Bling aceita 3 requisições por segundo por conta; ficamos abaixo disso.
const MIN_GAP_MS = 400;
// 429 por segundo é passageiro: espera e tenta de novo antes de desistir (a sincronização inteira não cai por uma rajada).
const RETRY_429_MS = [1_500, 4_000];

export class BlingApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export type BlingTokens = { access_token: string; refresh_token: string; expires_in: number };

/** Cliente HTTP mínimo da API v3 do Bling, com espaçamento entre chamadas para respeitar o limite. */
@Injectable()
export class BlingClient {
  private last = 0;
  private queue: Promise<unknown> = Promise.resolve();

  get appConfigured() {
    return Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET);
  }

  authorizeUrl(state: string) {
    return `${API}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: process.env.BLING_CLIENT_ID ?? '', state })}`;
  }

  /** Troca o código de autorização (ou o refresh token) por tokens novos. */
  async token(body: Record<string, string>): Promise<BlingTokens> {
    const basic = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', accept: '1.0' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new BlingApiError(response.status, `Bling recusou a autorização (${response.status})`);
    return response.json() as Promise<BlingTokens>;
  }

  /** Chamadas são serializadas e espaçadas; o limite vale por conta, não por rota. */
  request<T>(accessToken: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const run = async (attempt = 0): Promise<T> => {
      const wait = this.last + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.last = Date.now();
      const response = await fetch(`${API}${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : undefined;
      if (response.status === 429 && attempt < RETRY_429_MS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_429_MS[attempt]));
        return run(attempt + 1);
      }
      if (!response.ok) throw new BlingApiError(response.status, describeError(response.status, data, `${init.method ?? 'GET'} ${path}`));
      return data as T;
    };
    const result = this.queue.then(() => run(), () => run());
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const RESOURCES: [RegExp, string][] = [
  [/^\/contatos/, 'Contatos'], [/^\/pedidos\/vendas/, 'Pedidos de venda'], [/^\/produtos/, 'Produtos'], [/^\/estoques/, 'Estoques'],
  [/^\/nfe/, 'Notas fiscais'], [/^\/formas-pagamentos/, 'Formas de pagamento'], [/^\/categorias/, 'Categorias'], [/^\/contas\/receber/, 'Contas a receber'],
];

/** Junta a mensagem principal e os campos que o Bling apontou como inválidos. */
export function describeError(status: number, data: unknown, request?: string) {
  const raw = data as { error?: { type?: string; message?: string; description?: string; fields?: { msg?: string; element?: string }[] } } | undefined;
  // Falta de permissão no aplicativo do Bling: diz qual recurso, porque a correção é marcar o escopo no app e reconectar.
  if (status === 403 && /insufficient_scope/i.test(JSON.stringify(data ?? ''))) {
    const [method = 'GET', path = ''] = request?.split(' ') ?? [];
    const resource = RESOURCES.find(([pattern]) => pattern.test(path))?.[1] ?? path.split('?')[0];
    const action = method === 'GET' ? 'ler' : 'gravar';
    return `Bling 403: insufficient_scope. O aplicativo da loja no Bling não tem permissão para ${action} ${resource}. Marque esse escopo no aplicativo (Bling › Central de extensões › Área do integrador) e clique em Reconectar no painel.`;
  }
  const error = raw?.error;
  const fields = error?.fields?.map(f => [f.element, f.msg].filter(Boolean).join(': ')).filter(Boolean).join('; ');
  return `Bling ${status}: ${[error?.message ?? error?.description ?? 'erro', fields].filter(Boolean).join(' – ')}`.slice(0, 500);
}
