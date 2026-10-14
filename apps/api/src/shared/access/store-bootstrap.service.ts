import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
import { ensureOwnerRole, ensureStoreWithOwner } from './store-owner';

/**
 * Na subida da API: mantém permissões e papel "owner" em dia e, se BOOTSTRAP_STORE_SLUG,
 * BOOTSTRAP_OWNER_EMAIL e BOOTSTRAP_OWNER_PASSWORD estiverem definidos, cria a loja e o dono.
 * Depois da criação a variável de senha pode (e deve) ser removida.
 */
@Injectable()
export class StoreBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StoreBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const { BOOTSTRAP_STORE_SLUG: storeSlug, BOOTSTRAP_STORE_NAME: storeName, BOOTSTRAP_OWNER_EMAIL: email, BOOTSTRAP_OWNER_PASSWORD: password, BOOTSTRAP_OWNER_NAME: ownerName } = process.env;
    if (!storeSlug || !email || !password) {
      await ensureOwnerRole(this.prisma);
      return;
    }
    if (password.length < 12) throw new Error('BOOTSTRAP_OWNER_PASSWORD precisa ter pelo menos 12 caracteres');
    const { store, created } = await ensureStoreWithOwner(this.prisma, { storeSlug, storeName: storeName || storeSlug, email, password, ownerName: ownerName || 'Dono da loja' });
    this.logger.log(created ? `Loja "${store.slug}" pronta e dono ${email} criado` : `Loja "${store.slug}" já tem o dono ${email}; senha mantida`);
  }
}
