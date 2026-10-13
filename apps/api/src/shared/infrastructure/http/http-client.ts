import { Injectable } from '@nestjs/common';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | (string | number)[]>;
  body?: unknown;
  /** Corpo já serializado (ex.: application/x-www-form-urlencoded). */
  rawBody?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  text: string;
  durationMs: number;
  headers: Headers;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Cliente HTTP resiliente (timeout, retry exponencial com Retry-After) para provedores externos. */
@Injectable()
export class HttpClient {
  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResult<T>> {
    const retries = options.retries ?? 2;
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      try {
        const result = await this.once<T>(options, started);
        if (RETRYABLE.has(result.status) && attempt < retries) {
          await this.sleep(this.delay(attempt, result.headers.get('retry-after')));
          attempt += 1;
          continue;
        }
        return result;
      } catch (err) {
        if (attempt >= retries) throw err;
        await this.sleep(this.delay(attempt, null));
        attempt += 1;
      }
    }
  }

  private async once<T>(options: HttpRequestOptions, started: number): Promise<HttpResult<T>> {
    const url = new URL(options.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
      let body: string | undefined;
      if (options.rawBody !== undefined) body = options.rawBody;
      else if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        headers['content-type'] ??= 'application/json';
      }
      const response = await fetch(url, { method: options.method ?? 'GET', headers, body, signal: controller.signal });
      const text = await response.text();
      let data: T | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = null;
        }
      }
      return { status: response.status, ok: response.ok, data, text, durationMs: Date.now() - started, headers: response.headers };
    } finally {
      clearTimeout(timer);
    }
  }

  private delay(attempt: number, retryAfter: string | null): number {
    const fromHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
    if (!Number.isNaN(fromHeader) && fromHeader > 0) return Math.min(fromHeader, 30_000);
    return Math.min(500 * 2 ** attempt, 8_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
