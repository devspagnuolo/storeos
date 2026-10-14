import { Module } from '@nestjs/common';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
@Module({ controllers: [CouponsController, PromotionsController], providers: [CouponsService, PromotionsService], exports: [CouponsService, PromotionsService] }) export class PromotionsModule {}
