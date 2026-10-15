import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { normalizePath, normalizeTarget, nuvemshopRedirects, parseRedirectCsv, validateFrom, wouldLoop } from './redirect-rules';

@Injectable()
export class RedirectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async map(storeId: string) {
    const rows = await this.prisma.redirect.findMany({ where: { storeId }, select: { fromPath: true, toPath: true } });
    return new Map(rows.map(r => [r.fromPath, r.toPath]));
  }

  private check(from: string, toRaw: string, existing: ReadonlyMap<string, string>) {
    const fromPath = normalizePath(from);
    const invalid = validateFrom(fromPath);
    if (invalid) throw new BadRequestException(invalid);
    const target = normalizeTarget(toRaw);
    if (!target.ok) throw new BadRequestException(target.error);
    if (!target.to.startsWith('https://') && wouldLoop(fromPath, target.to, existing)) throw new BadRequestException('Esse redirecionamento criaria um laço: o destino volta para o endereço antigo');
    return { fromPath, toPath: target.to };
  }

  async list(storeId: string, q?: string) {
    const term = q?.trim().toLowerCase();
    const [items, total] = await Promise.all([
      this.prisma.redirect.findMany({ where: { storeId, ...(term && { OR: [{ fromPath: { contains: term } }, { toPath: { contains: term } }] }) }, orderBy: [{ hits: 'desc' }, { createdAt: 'desc' }], take: 300 }),
      this.prisma.redirect.count({ where: { storeId } }),
    ]);
    return { items, total };
  }

  async create(storeId: string, from: string, to: string) {
    const existing = await this.map(storeId);
    const data = this.check(from, to, existing);
    if (existing.has(data.fromPath)) throw new ConflictException('Já existe um redirecionamento para esse endereço antigo');
    return this.prisma.redirect.create({ data: { storeId, ...data } });
  }

  async update(storeId: string, id: string, to: string) {
    const current = await this.prisma.redirect.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundException('Redirecionamento não encontrado');
    const existing = await this.map(storeId);
    existing.delete(current.fromPath);
    const data = this.check(current.fromPath, to, existing);
    return this.prisma.redirect.update({ where: { id }, data: { toPath: data.toPath } });
  }

  async remove(storeId: string, id: string) {
    const { count } = await this.prisma.redirect.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Redirecionamento não encontrado');
  }

  /** Importa uma planilha antigo,novo. Linhas repetidas ou inválidas são puladas e listadas. */
  async importCsv(storeId: string, csv: string) {
    const { rows, errors } = parseRedirectCsv(csv);
    if (rows.length > 5000) throw new BadRequestException('Envie no máximo 5000 linhas por vez');
    const existing = await this.map(storeId);
    const skipped: { line: number; error: string }[] = [...errors];
    const data: { storeId: string; fromPath: string; toPath: string }[] = [];
    for (const row of rows) {
      try {
        const checked = this.check(row.from, row.to, existing);
        if (existing.has(checked.fromPath)) { skipped.push({ line: row.line, error: 'Já existe um redirecionamento para esse endereço' }); continue; }
        existing.set(checked.fromPath, checked.toPath);
        data.push({ storeId, ...checked });
      } catch (error) {
        skipped.push({ line: row.line, error: (error as Error).message });
      }
    }
    if (data.length) await this.prisma.redirect.createMany({ data, skipDuplicates: true });
    return { created: data.length, skipped: skipped.sort((a, b) => a.line - b.line) };
  }

  /** Cria os endereços de produto e categoria no formato da Nuvemshop que ainda não existem. */
  async generateNuvemshop(storeId: string) {
    const [products, categories, existing] = await Promise.all([
      this.prisma.product.findMany({ where: { storeId, status: ProductStatus.ACTIVE }, select: { slug: true }, take: 5000 }),
      this.prisma.category.findMany({ where: { storeId }, select: { slug: true }, take: 2000 }),
      this.map(storeId),
    ]);
    const data = nuvemshopRedirects(products, categories).filter(p => !existing.has(p.from)).map(p => ({ storeId, fromPath: p.from, toPath: p.to }));
    if (data.length) await this.prisma.redirect.createMany({ data, skipDuplicates: true });
    return { created: data.length };
  }

  /** Usado pela vitrine: devolve o destino do endereço, se houver, e conta o acesso. */
  async resolve(input: { store?: string; host?: string; path: string }) {
    const storeId = await this.storeId(input);
    if (!storeId) throw new NotFoundException();
    const fromPath = normalizePath(input.path);
    const found = await this.prisma.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath } } });
    if (!found) throw new NotFoundException();
    void this.prisma.redirect.update({ where: { id: found.id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => undefined);
    return { to: found.toPath, status: 301 };
  }

  private async storeId({ store, host }: { store?: string; host?: string }) {
    if (host) {
      const domain = await this.prisma.storeDomain.findFirst({ where: { hostname: host.toLowerCase(), status: 'ACTIVE' }, select: { storeId: true } });
      if (domain) return domain.storeId;
    }
    if (!store) return undefined;
    return (await this.prisma.store.findUnique({ where: { slug: store }, select: { id: true } }))?.id;
  }
}
