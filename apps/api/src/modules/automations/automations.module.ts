import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
@Module({ imports: [NotificationsModule], controllers: [AutomationsController], providers: [AutomationsService], exports: [AutomationsService] }) export class AutomationsModule {}
