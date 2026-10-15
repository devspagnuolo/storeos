import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketingController } from './marketing.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({ imports: [NotificationsModule, CustomersModule], controllers: [MarketingController], providers: [MarketingCampaignsService], exports: [MarketingCampaignsService] })
export class MarketingModule {}
