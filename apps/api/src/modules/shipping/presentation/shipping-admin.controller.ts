import { Controller, Get, Patch, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { fromCents } from '../../../shared/domain/money';
import { AuthStoreId, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { NotFoundError } from '../../../shared/domain/errors';

const methodSchema = z.object({
  name: z.string().min(2).max(80),
  provider: z.enum(['flat_rate', 'zone_table', 'melhor_envio']),
  config: z.record(z.unknown()).default({}),
  freeShippingThresholdCents: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
});

@ApiTags('Admin · Frete')
@ApiBearerAuth()
@Controller('admin/shipping')
export class ShippingAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('store.read')
  @Get('methods')
  list(@AuthStoreId() storeId: string) {
    return this.prisma.shippingMethod.findMany({ where: { storeId }, orderBy: { position: 'asc' }, include: { rules: true } });
  }

  @RequirePermissions('store.write')
  @Post('methods')
  create(@AuthStoreId() storeId: string, @ZodBody(methodSchema) body: z.infer<typeof methodSchema>) {
    return this.prisma.shippingMethod.create({
      data: {
        storeId,
        name: body.name,
        provider: body.provider,
        config: body.config as never,
        active: body.active,
        freeShippingThreshold: body.freeShippingThresholdCents == null ? null : fromCents(body.freeShippingThresholdCents),
      },
    });
  }

  @RequirePermissions('store.write')
  @Patch('methods/:id')
  async update(@AuthStoreId() storeId: string, @Param('id', ParseUUIDPipe) id: string, @ZodBody(methodSchema.partial()) body: Partial<z.infer<typeof methodSchema>>) {
    const found = await this.prisma.shippingMethod.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Método de frete não encontrado');
    return this.prisma.shippingMethod.update({
      where: { id },
      data: {
        name: body.name,
        provider: body.provider,
        config: body.config as never,
        active: body.active,
        freeShippingThreshold: body.freeShippingThresholdCents === undefined ? undefined : body.freeShippingThresholdCents === null ? null : fromCents(body.freeShippingThresholdCents),
      },
    });
  }

  @RequirePermissions('store.write')
  @Post('methods/:id/rules')
  async addRule(
    @AuthStoreId() storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(z.object({ zipFrom: z.string().length(8), zipTo: z.string().length(8), minWeightGrams: z.number().int().min(0).default(0), maxWeightGrams: z.number().int().default(1_000_000), priceCents: z.number().int().min(0), estimatedDays: z.number().int().min(0).default(5) }))
    body: { zipFrom: string; zipTo: string; minWeightGrams: number; maxWeightGrams: number; priceCents: number; estimatedDays: number },
  ) {
    const found = await this.prisma.shippingMethod.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Método de frete não encontrado');
    return this.prisma.shippingRateRule.create({
      data: { methodId: id, zipFrom: body.zipFrom, zipTo: body.zipTo, minWeightGrams: body.minWeightGrams, maxWeightGrams: body.maxWeightGrams, price: fromCents(body.priceCents), estimatedDays: body.estimatedDays },
    });
  }
}

