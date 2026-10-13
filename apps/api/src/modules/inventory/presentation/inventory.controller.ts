import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { stockAdjustSchema } from '@storeos/contracts';
import { z } from 'zod';
import { AuthStoreId, CurrentAuth, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext } from '../../../shared/presentation/request.types';
import { InventoryService } from '../application/inventory.service';

@ApiTags('Admin · Estoque')
@ApiBearerAuth()
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions('inventory.write')
  @Post('adjust')
  adjust(@CurrentAuth() auth: AuthContext, @ZodBody(stockAdjustSchema) body: z.infer<typeof stockAdjustSchema>) {
    return this.inventory.adjust(auth.storeId, { ...body, type: body.delta > 0 ? 'RECEIPT' : 'ADJUSTMENT' }, auth.subjectId);
  }

  @RequirePermissions('inventory.read')
  @Get('low-stock')
  lowStock(@AuthStoreId() storeId: string, @Query('limit') limit?: string) {
    return this.inventory.lowStock(storeId, Math.min(Number(limit) || 50, 200));
  }

  @RequirePermissions('inventory.read')
  @Get('variants/:variantId/movements')
  movements(@AuthStoreId() storeId: string, @Param('variantId') variantId: string) {
    return this.inventory.movements(storeId, variantId);
  }
}
