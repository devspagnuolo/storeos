import { Injectable } from '@nestjs/common';
import { ROLE_PRESETS } from '@storeos/contracts';
import { Tx } from '../../../shared/infrastructure/prisma/prisma.service';
import { PermissionCatalogService } from './permission-catalog.service';

/** Cria os recursos padrão de uma loja nova (papéis, depósito, frete, fidelidade, navegação). */
@Injectable()
export class StoreBootstrapService {
  constructor(private readonly permissions: PermissionCatalogService) {}

  async bootstrap(tx: Tx, storeId: string): Promise<{ roleIds: Record<string, string> }> {
    const permissionIds = await this.permissions.ensure(tx);
    const roleIds: Record<string, string> = {};

    for (const [name, preset] of Object.entries(ROLE_PRESETS)) {
      const role = await tx.role.create({
        data: { storeId, name, description: preset.description, isSystem: true },
      });
      roleIds[name] = role.id;
      await tx.rolePermission.createMany({
        data: preset.permissions
          .map((key) => permissionIds.get(key))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }

    await tx.warehouse.create({ data: { storeId, name: 'Depósito principal', code: 'MAIN', isDefault: true } });
    await tx.shippingMethod.create({
      data: {
        storeId,
        name: 'Frete padrão',
        provider: 'flat_rate',
        config: { baseCents: 2490, estimatedDays: 7 },
        freeShippingThreshold: '299.00',
        position: 0,
      },
    });
    await tx.loyaltyProgram.create({
      data: {
        storeId,
        tiers: {
          BRONZE: { minSpent: 0, cashbackBonusPercent: 0 },
          SILVER: { minSpent: 1000, cashbackBonusPercent: 1 },
          GOLD: { minSpent: 5000, cashbackBonusPercent: 2 },
          DIAMOND: { minSpent: 15000, cashbackBonusPercent: 4 },
        },
      },
    });
    await tx.navigation.createMany({
      data: [
        { storeId, key: 'header', items: [{ label: 'Novidades', href: '/busca?sort=newest' }, { label: 'Promoções', href: '/busca?onSale=true' }] },
        { storeId, key: 'footer', items: [{ label: 'Sobre nós', href: '/p/sobre' }, { label: 'Privacidade', href: '/p/privacidade' }] },
      ],
    });
    await tx.storeCounter.create({ data: { storeId, key: 'order', value: 1000 } });
    return { roleIds };
  }
}
