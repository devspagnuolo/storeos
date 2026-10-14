import { Module } from '@nestjs/common';
import { createMailProvider, MAIL_PROVIDER } from './mail-provider';
import { NotificationsController } from './notifications.controller';
import { OutboxDispatcher } from './outbox-dispatcher';
@Module({ controllers: [NotificationsController], providers: [OutboxDispatcher, { provide: MAIL_PROVIDER, useFactory: () => createMailProvider() }], exports: [OutboxDispatcher] }) export class NotificationsModule {}
