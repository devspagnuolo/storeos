import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { AppConfig } from '../../../config/app-config';

export const EVENTS_EXCHANGE = 'storeos.events';

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly connection: AmqpConnectionManager | null;
  private readonly channel: ChannelWrapper | null;

  constructor(config: AppConfig) {
    const url = config.env.RABBITMQ_URL;
    if (!url) {
      this.connection = null;
      this.channel = null;
      return;
    }
    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ conectado'));
    this.connection.on('disconnect', (e) => this.logger.warn(`RabbitMQ desconectado: ${e.err?.message ?? 'desconhecido'}`));
    this.channel = this.connection.createChannel({
      json: true,
      setup: (ch: ConfirmChannel) => ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
    });
  }

  get enabled(): boolean {
    return this.channel !== null;
  }

  isConnected(): boolean {
    return this.connection ? this.connection.isConnected() : true;
  }

  async publish(routingKey: string, message: unknown, messageId: string): Promise<void> {
    if (!this.channel) return;
    await this.channel.publish(EVENTS_EXCHANGE, routingKey, message, {
      persistent: true,
      messageId,
      contentType: 'application/json',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
