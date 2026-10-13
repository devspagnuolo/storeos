import { Module } from '@nestjs/common';
import { MarketingService } from './application/marketing.service';
import { MarketingAdminController } from './presentation/marketing-admin.controller';

@Module({ controllers: [MarketingAdminController], providers: [MarketingService], exports: [MarketingService] })
export class MarketingModule {}
