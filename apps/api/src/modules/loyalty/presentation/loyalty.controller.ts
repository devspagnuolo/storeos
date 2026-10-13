import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginationQuery } from '@storeos/contracts';
import { z } from 'zod';
import { AuthStoreId, CurrentAuth, CustomerAuth, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody, ZodQuery } from '../../../shared/presentation/pipes/zod';
import type { AuthContext } from '../../../shared/presentation/request.types';
import { LoyaltyProgramInput, loyaltyProgramSchema, LoyaltyService } from '../application/loyalty.service';

@ApiTags('Storefront · Fidelidade')
@ApiBearerAuth()
@CustomerAuth()
@Controller('store/loyalty')
export class LoyaltyStorefrontController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.loyalty.me(auth.storeId, auth.subjectId);
  }

  @HttpCode(200)
  @Post('convert-points')
  convert(@CurrentAuth() auth: AuthContext, @ZodBody(z.object({ points: z.number().int().min(100) })) body: { points: number }) {
    return this.loyalty.convertPoints(auth.storeId, auth.subjectId, body.points);
  }
}

@ApiTags('Admin · Fidelidade')
@ApiBearerAuth()
@Controller('admin/loyalty')
export class LoyaltyAdminController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @RequirePermissions('loyalty.read')
  @Get('program')
  program(@AuthStoreId() storeId: string) {
    return this.loyalty.program(storeId);
  }

  @RequirePermissions('loyalty.write')
  @Put('program')
  update(@AuthStoreId() storeId: string, @ZodBody(loyaltyProgramSchema) body: LoyaltyProgramInput) {
    return this.loyalty.updateProgram(storeId, body);
  }

  @RequirePermissions('loyalty.read')
  @Get('accounts')
  accounts(@AuthStoreId() storeId: string, @ZodQuery(paginationQuery) q: z.infer<typeof paginationQuery>) {
    return this.loyalty.listAccounts(storeId, q.page, q.pageSize);
  }
}
