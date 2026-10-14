import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentRouter } from './payment-router';
import { PaymentsConfigController } from './payments-config.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsWebhookService } from './payments-webhook.service';
@Module({ imports: [OrdersModule], controllers: [PaymentsWebhookController, PaymentsConfigController], providers: [ManualPaymentProvider, MercadoPagoClient, MercadoPagoProvider, PaymentRouter, PaymentsWebhookService, { provide: PAYMENT_PROVIDER, useExisting: PaymentRouter }], exports: [PAYMENT_PROVIDER] }) export class PaymentsModule {}
