import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AbandonedCartsController } from './abandoned-carts.controller';
import { AbandonedCartsService } from './abandoned-carts.service';

@Module({ imports: [NotificationsModule], controllers: [AbandonedCartsController], providers: [AbandonedCartsService], exports: [AbandonedCartsService] })
export class AbandonedCartsModule {}
