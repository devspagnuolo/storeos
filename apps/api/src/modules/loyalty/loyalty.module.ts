import { Module } from '@nestjs/common';
import { LoyaltyService } from './application/loyalty.service';
import { LoyaltyAdminController, LoyaltyStorefrontController } from './presentation/loyalty.controller';

@Module({
  controllers: [LoyaltyStorefrontController, LoyaltyAdminController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
