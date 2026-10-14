import { BadRequestException } from '@nestjs/common';

export const MAX_DOMAINS_PER_STORE = 5;
export const CHALLENGE_PREFIX = '_storeos-challenge';
const reservedSuffixes = ['localhost', 'local', 'internal', 'onrender.com', 'vercel.app', 'herokuapp.com', 'example.com'];

/** Aceita "Loja.com.br", "https://www.loja.com.br/" e devolve só o host em minúsculas; recusa IP, porta, caminho e hosts reservados. */
export function normalizeHostname(input: unknown): string {
  if (typeof input !== 'string') throw new BadRequestException('Informe o domínio.');
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.$/, '');
  if (!host || host.length > 253) throw new BadRequestException('Domínio inválido.');
  if (/[/:?#@\s]/.test(host)) throw new BadRequestException('Informe apenas o domínio, sem caminho, porta ou usuário (ex.: www.minhaloja.com.br).');
  if (/^\d+(\.\d+){3}$/.test(host)) throw new BadRequestException('Use um nome de domínio, não um endereço IP.');
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every(label => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label)) || !/^[a-z]{2,}$/.test(labels.at(-1)!)) {
    throw new BadRequestException('Domínio inválido. Exemplo: www.minhaloja.com.br');
  }
  if (reservedSuffixes.some(suffix => host === suffix || host.endsWith('.' + suffix))) {
    throw new BadRequestException('Este domínio não pode ser usado como domínio da loja.');
  }
  return host;
}

/** www.loja.com.br e subdomínios usam CNAME; o domínio raiz (loja.com.br) precisa de A/ALIAS. Heurística simples para sufixos .com.br etc. */
export function isApex(hostname: string) {
  const labels = hostname.split('.');
  const second = ['com', 'net', 'org', 'gov', 'edu'];
  return labels.length === 2 || (labels.length === 3 && labels.at(-1)!.length === 2 && second.includes(labels[1]));
}

export type DnsRecord = { type: 'TXT' | 'CNAME' | 'A'; name: string; value: string; purpose: string };

export function dnsInstructions(hostname: string, token: string, config: { cnameTarget?: string; edgeIps: string[] }): DnsRecord[] {
  const records: DnsRecord[] = [{ type: 'TXT', name: `${CHALLENGE_PREFIX}.${hostname}`, value: token, purpose: 'Prova que o domínio é seu' }];
  if (isApex(hostname) && config.edgeIps.length) {
    for (const ip of config.edgeIps) records.push({ type: 'A', name: hostname, value: ip, purpose: 'Aponta o domínio raiz para a loja' });
  } else if (config.cnameTarget) {
    records.push({ type: 'CNAME', name: hostname, value: config.cnameTarget, purpose: isApex(hostname) ? 'Aponta o domínio (use ALIAS/ANAME se o provedor não aceitar CNAME na raiz)' : 'Aponta o domínio para a loja' });
  }
  return records;
}

export type DomainChecks = { txt: boolean; routing: boolean; tls: boolean; error?: string };

/** Estado final a partir das verificações: só vira ACTIVE com posse provada, roteamento correto e HTTPS válido. */
export function resolveStatus(checks: DomainChecks): 'PENDING_DNS' | 'DNS_VERIFIED' | 'ACTIVE' {
  if (!checks.txt || !checks.routing) return 'PENDING_DNS';
  return checks.tls ? 'ACTIVE' : 'DNS_VERIFIED';
}

export function explain(checks: DomainChecks): string | null {
  if (!checks.txt) return 'Registro TXT de verificação não encontrado. O DNS pode levar de minutos a algumas horas para propagar.';
  if (!checks.routing) return 'O domínio ainda não aponta para a loja (CNAME/A). Confira o registro no seu provedor de DNS.';
  if (!checks.tls) return checks.error ?? 'DNS correto, mas o HTTPS ainda não responde com certificado válido. A emissão do certificado pode levar alguns minutos.';
  return null;
}
