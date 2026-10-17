import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountController } from './account.controller';
import { AccountCleanupJob } from './account.job';
import { AccountService } from './account.service';

@Module({ imports: [LoyaltyModule, NotificationsModule], controllers: [AccountController], providers: [AccountService, AccountCleanupJob], exports: [AccountService] })
export class AccountModule {}
