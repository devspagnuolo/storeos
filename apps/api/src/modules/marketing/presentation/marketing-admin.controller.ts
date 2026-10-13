import { Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthStoreId, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import { CouponInput, couponInputSchema, MarketingService, PromotionInput, promotionInputSchema } from '../application/marketing.service';

@ApiTags('Admin · Marketing')
@ApiBearerAuth()
@Controller('admin/marketing')
export class MarketingAdminController {
  constructor(private readonly marketing: MarketingService) {}

  @RequirePermissions('marketing.read')
  @Get('coupons')
  coupons(@AuthStoreId() storeId: string) {
    return this.marketing.listCoupons(storeId);
  }

  @RequirePermissions('marketing.write')
  @Post('coupons')
  createCoupon(@AuthStoreId() storeId: string, @ZodBody(couponInputSchema) body: CouponInput) {
    return this.marketing.createCoupon(storeId, body);
  }

  @RequirePermissions('marketing.write')
  @Patch('coupons/:id')
  updateCoupon(@AuthStoreId() storeId: string, @Param('id', ParseUUIDPipe) id: string, @ZodBody(couponInputSchema.partial()) body: Partial<CouponInput>) {
    return this.marketing.updateCoupon(storeId, id, body);
  }

  @RequirePermissions('marketing.read')
  @Get('promotions')
  promotions(@AuthStoreId() storeId: string) {
    return this.marketing.listPromotions(storeId);
  }

  @RequirePermissions('marketing.write')
  @Post('promotions')
  createPromotion(@AuthStoreId() storeId: string, @ZodBody(promotionInputSchema) body: PromotionInput) {
    return this.marketing.createPromotion(storeId, body);
  }

  @RequirePermissions('marketing.write')
  @Patch('promotions/:id')
  updatePromotion(@AuthStoreId() storeId: string, @Param('id', ParseUUIDPipe) id: string, @ZodBody(promotionInputSchema.partial()) body: Partial<PromotionInput>) {
    return this.marketing.updatePromotion(storeId, id, body);
  }
}
