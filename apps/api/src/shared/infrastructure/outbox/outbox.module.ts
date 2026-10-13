import { Global, Module } from '@nestjs/common';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { EventDispatcher } from './event-dispatcher';
import { OutboxRelay } from './outbox.relay';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, EventDispatcher, OutboxRelay, RabbitMqService],
  exports: [OutboxService, EventDispatcher, OutboxRelay, RabbitMqService],
})
export class OutboxModule {}
