import { Injectable } from '@nestjs/common';
import { fidelizeiBaseUrl } from './fidelizei-rules';

export class FidelizeiApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

type RequestInit = { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string };

/** Chamadas servidor a servidor à API pública do Fidelizei. A chave nunca vai para o navegador nem para os logs. */
@Injectable()
export class FidelizeiClient {
  async request<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${fidelizeiBaseUrl()}${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json', ...(init.body !== undefined && { 'content-type': 'application/json' }), ...(init.idempotencyKey && { 'idempotency-key': init.idempotencyKey }) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new FidelizeiApiError(0, `Fidelizei fora do ar ou inacessível (${(error as Error).name === 'TimeoutError' ? 'tempo esgotado' : (error as Error).message})`);
    }
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
    if (!response.ok) throw new FidelizeiApiError(response.status, body.error ?? `Fidelizei respondeu ${response.status}`, body.code);
    return body as T;
  }
}
