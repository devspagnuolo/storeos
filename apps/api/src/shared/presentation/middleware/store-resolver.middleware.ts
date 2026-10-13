import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RequestContext } from '../../infrastructure/request-context';
import type { AppRequest, StoreContext } from '../request.types';

/**
 * Resolve o tenant das rotas públicas: header x-store-slug, query ?store= ou domínio customizado (Host).
 * Nunca falha: rotas que exigem loja usam @PublicStore().
 */
@Injectable()
export class StoreResolverMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async use(req: AppRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      const headerSlug = req.headers['x-store-slug'];
      const querySlug = typeof req.query?.store === 'string' ? req.query.store : undefined;
      const slug = (typeof headerSlug === 'string' ? headerSlug : undefined) ?? querySlug;
      if (slug && /^[a-z0-9-]{2,60}$/.test(slug)) {
        const store = await this.bySlug(slug);
        if (store) this.attach(req, store);
      } else if (req.hostname) {
        const store = await this.byHost(req.hostname.toLowerCase());
        if (store) this.attach(req, store);
      }
    } catch {
      // resolução é best-effort
    }
    next();
  }

  private attach(req: AppRequest, store: StoreContext): void {
    req.store = store;
    RequestContext.set({ storeId: store.id });
  }

  private bySlug(slug: string): Promise<StoreContext | null> {
    return this.cache.wrap<StoreContext | null>(`store:slug:${slug}`, 60, async () => {
      const s = await this.prisma.store.findUnique({ where: { slug } });
      return s && s.status === 'ACTIVE' ? { id: s.id, slug: s.slug, name: s.name, currency: s.currency, status: s.status } : null;
    });
  }

  private byHost(hostname: string): Promise<StoreContext | null> {
    return this.cache.wrap<StoreContext | null>(`store:host:${hostname}`, 60, async () => {
      const d = await this.prisma.storeDomain.findUnique({ where: { hostname }, include: { store: true } });
      return d && d.verifiedAt && d.store.status === 'ACTIVE'
        ? { id: d.store.id, slug: d.store.slug, name: d.store.name, currency: d.store.currency, status: d.store.status }
        : null;
    });
  }
}
