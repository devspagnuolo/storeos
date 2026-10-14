import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { CHALLENGE_PREFIX, DomainChecks, dnsInstructions, explain, MAX_DOMAINS_PER_STORE, normalizeHostname, resolveStatus } from './domain-rules';
import { DnsResolver, TlsProbe } from './domain-probes';

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService, private readonly dns: DnsResolver, private readonly tlsProbe: TlsProbe) {}

  private config() {
    return {
      cnameTarget: process.env.STOREOS_CNAME_TARGET?.trim().toLowerCase() || undefined,
      edgeIps: (process.env.STOREOS_EDGE_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean),
    };
  }

  private view(domain: { id: string; hostname: string; status: string; verificationToken: string; isPrimary: boolean; dnsVerifiedAt: Date | null; tlsValidUntil: Date | null; lastCheckedAt: Date | null; lastError: string | null; createdAt: Date }) {
    const { verificationToken, ...rest } = domain;
    return { ...rest, records: dnsInstructions(domain.hostname, verificationToken, this.config()) };
  }

  async list(storeId: string) {
    const domains = await this.prisma.storeDomain.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } });
    const config = this.config();
    return { domains: domains.map(domain => this.view(domain)), routingConfigured: Boolean(config.cnameTarget || config.edgeIps.length), limit: MAX_DOMAINS_PER_STORE };
  }

  async add(storeId: string, input: unknown) {
    const hostname = normalizeHostname(input);
    if (await this.prisma.storeDomain.count({ where: { storeId } }) >= MAX_DOMAINS_PER_STORE) throw new BadRequestException(`Cada loja aceita até ${MAX_DOMAINS_PER_STORE} domínios.`);
    try {
      const domain = await this.prisma.storeDomain.create({ data: { storeId, hostname, verificationToken: 'storeos-' + randomBytes(16).toString('hex') } });
      return this.view(domain);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Este domínio já está cadastrado.');
      throw error;
    }
  }

  private async mine(storeId: string, id: string) {
    const domain = await this.prisma.storeDomain.findFirst({ where: { id, storeId } });
    if (!domain) throw new NotFoundException('Domínio não encontrado nesta loja.');
    return domain;
  }

  /** Confere posse (TXT), roteamento (CNAME/A) e HTTPS; guarda o resultado e o motivo, e devolve o estado. */
  async verify(storeId: string, id: string) {
    const domain = await this.mine(storeId, id);
    const config = this.config();
    const txt = (await this.dns.txt(`${CHALLENGE_PREFIX}.${domain.hostname}`)).includes(domain.verificationToken);
    let routing = false;
    if (config.cnameTarget) routing = (await this.dns.cname(domain.hostname)).includes(config.cnameTarget);
    if (!routing && config.edgeIps.length) { const ips = await this.dns.a(domain.hostname); routing = ips.length > 0 && ips.every(ip => config.edgeIps.includes(ip)); }
    let tlsOk = false;
    let tlsError: string | undefined;
    let validUntil: Date | undefined;
    if (txt && routing) { const result = await this.tlsProbe.check(domain.hostname); tlsOk = result.ok; tlsError = result.error; validUntil = result.validUntil; }
    const checks: DomainChecks = { txt, routing, tls: tlsOk, error: tlsError };
    const status = resolveStatus(checks);
    const updated = await this.prisma.storeDomain.update({ where: { id }, data: {
      status, lastCheckedAt: new Date(), lastError: explain(checks),
      dnsVerifiedAt: txt && routing ? (domain.dnsVerifiedAt ?? new Date()) : null,
      tlsValidUntil: tlsOk ? validUntil ?? null : null,
      ...(status !== 'ACTIVE' && domain.isPrimary ? { isPrimary: false } : {}),
    } });
    return { ...this.view(updated), checks: { txt, routing, tls: tlsOk } };
  }

  async makePrimary(storeId: string, id: string) {
    const domain = await this.mine(storeId, id);
    if (domain.status !== 'ACTIVE') throw new BadRequestException('Só um domínio ativo (DNS e HTTPS validados) pode ser o principal.');
    await this.prisma.$transaction([
      this.prisma.storeDomain.updateMany({ where: { storeId, isPrimary: true }, data: { isPrimary: false } }),
      this.prisma.storeDomain.update({ where: { id }, data: { isPrimary: true } }),
    ]);
    return this.list(storeId);
  }

  async remove(storeId: string, id: string) {
    await this.mine(storeId, id);
    await this.prisma.storeDomain.delete({ where: { id } });
    return this.list(storeId);
  }

  /** Resolve a loja de um domínio ativo (roteamento por host). Domínios não validados nunca resolvem. */
  async storeSlugByHost(host: string) {
    let hostname: string;
    try { hostname = normalizeHostname(host); } catch { throw new NotFoundException('Domínio não encontrado'); }
    const domain = await this.prisma.storeDomain.findFirst({ where: { hostname, status: 'ACTIVE' }, select: { hostname: true, store: { select: { slug: true } } } });
    if (!domain) throw new NotFoundException('Domínio não encontrado');
    return { slug: domain.store.slug, hostname: domain.hostname };
  }

  primaryHostname(storeId: string) {
    return this.prisma.storeDomain.findFirst({ where: { storeId, isPrimary: true, status: 'ACTIVE' }, select: { hostname: true } }).then(row => row?.hostname ?? null);
  }
}
