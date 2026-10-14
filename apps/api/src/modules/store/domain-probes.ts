import { Injectable } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';

/** Consultas DNS isoladas para poderem ser trocadas por um fake nos testes. */
@Injectable()
export class DnsResolver {
  async txt(name: string): Promise<string[]> {
    try { return (await dns.resolveTxt(name)).map(parts => parts.join('')); } catch { return []; }
  }
  async cname(name: string): Promise<string[]> {
    try { return (await dns.resolveCname(name)).map(host => host.toLowerCase().replace(/\.$/, '')); } catch { return []; }
  }
  async a(name: string): Promise<string[]> {
    try { return await dns.resolve4(name); } catch { return []; }
  }
}

export type TlsResult = { ok: boolean; validUntil?: Date; error?: string };

@Injectable()
export class TlsProbe {
  /** Conecta em :443 validando cadeia e nome do certificado; não confia em certificados inválidos. */
  check(hostname: string): Promise<TlsResult> {
    return new Promise(resolve => {
      const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: true, timeout: 6000 }, () => {
        const cert = socket.getPeerCertificate();
        const validUntil = cert?.valid_to ? new Date(cert.valid_to) : undefined;
        socket.end();
        resolve({ ok: socket.authorized, validUntil });
      });
      socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, error: 'O HTTPS não respondeu a tempo.' }); });
      socket.on('error', error => resolve({ ok: false, error: `Certificado/HTTPS ainda não válido (${(error as NodeJS.ErrnoException).code ?? error.message}).` }));
    });
  }
}
