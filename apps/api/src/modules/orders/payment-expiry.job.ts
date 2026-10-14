import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderLifecycleService } from './order-lifecycle.service';

@Injectable()
export class PaymentExpiryJob {
  private readonly logger = new Logger(PaymentExpiryJob.name);
  private running = false;

  constructor(private readonly lifecycle: OrderLifecycleService) {}

  @Interval(5 * 60_000)
  async run() {
    if (this.running || process.env.PAYMENT_EXPIRY_JOB === 'off') return;
    this.running = true;
    try {
      const expired = await this.lifecycle.expireOverdue();
      if (expired) this.logger.log(`${expired} pedido(s) expirado(s) e estoque liberado`);
    } catch (error) {
      this.logger.error('Falha ao expirar pedidos', error as Error);
    } finally {
      this.running = false;
    }
  }
}
