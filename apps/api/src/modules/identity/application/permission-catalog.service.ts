import { Injectable, OnModuleInit } from '@nestjs/common';
import { PERMISSIONS } from '@storeos/contracts';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';

/** Mantém a tabela Permission alinhada ao catálogo em código (idempotente). */
@Injectable()
export class PermissionCatalogService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensure(this.prisma);
  }

  async ensure(client: PrismaService | Tx): Promise<Map<string, string>> {
    await client.permission.createMany({ data: PERMISSIONS.map((key) => ({ key })), skipDuplicates: true });
    const rows = await client.permission.findMany({ where: { key: { in: [...PERMISSIONS] } } });
    return new Map(rows.map((r) => [r.key, r.id]));
  }
}
